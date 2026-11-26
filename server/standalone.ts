// Server standalone untuk Sistem Kepegawaian Disperkimtan.
//
// Menjalankan aplikasi yang sama seperti di Muse, tanpa Muse:
//  - menyajikan file statis hasil build di client/dist/
//  - melayani POST /actions dengan dispatcher yang sama seperti worker
//    Muse: cari aksi di Actions, validasi args (zod), panggil handler
//    dengan ctx { db, invalidateQueries }, validasi hasil (zod).
//
// Data tinggal di ./app.db (SQLite, drizzle). Port default 4173, bisa
// diubah lewat env KEPEGAWAIAN_PORT. Jalankan: `bun run start`
// (atau klik ganda JALANKAN.bat di Windows).

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getSessionUser, handleAuthRequest } from "./auth";
import { Actions } from "./src/actions";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, "app.db");
const DIST_DIR = join(ROOT, "client", "dist");
const PORT = Number(process.env.KEPEGAWAIAN_PORT ?? 4173);

// ---------- Database: buka, migrasi bila perlu, seed bila kosong ----------
const sqlite = new Database(DB_PATH);

function tableExists(name: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name: string } | null;
  return row !== null;
}

function runMigrationFile(relPath: string) {
  const sql = readFileSync(join(ROOT, relPath), "utf8");
  for (const part of sql.split(/^--> statement-breakpoint$/m)) {
    const stmt = part.trim();
    if (stmt) sqlite.exec(stmt);
  }
}

if (!tableExists("pegawai") || !tableExists("settings")) {
  runMigrationFile("drizzle/0001_initial.sql");
  runMigrationFile("drizzle/0002_pegawai_dan_pengaturan.sql");
  console.log("Database dibuat dari migrasi drizzle/");
}

if (!tableExists("users") || !tableExists("sessions") || !tableExists("password_resets")) {
  runMigrationFile("drizzle/0003_auth.sql");
  console.log("Tabel autentikasi dibuat dari drizzle/0003_auth.sql");
} else if (!tableExists("email_verifications")) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
  `);
  console.log("Tabel email_verifications ditambahkan.");
}

const db = drizzle(sqlite);

// Driver drizzle bun-sqlite TIDAK menyediakan `db.batch()` (dipakai handler
// seedPegawai), padahal di Muse batch tersedia lewat ctx.db worker. Pasang
// shim yang menjalankan tiap pernyataan berurutan — cukup untuk seed 69
// baris; handler actions.ts sendiri TIDAK diubah.
const dbAny = db as any;
if (typeof dbAny.batch !== "function") {
  dbAny.batch = async (items: any[]) => {
    const out: unknown[] = [];
    for (const item of items) {
      out.push(await item);
    }
    return out;
  };
}

// ctx seperti yang diterima handler di Muse; invalidateQueries tidak
// diperlukan di standalone karena App.tsx sudah invalidate query ["state"]
// sendiri setiap mutasi berhasil.
const ctx = {
  db: () => db,
  invalidateQueries: () => {},
};

type DispatchResult = { status: number; body: { data?: unknown; error?: string } };

async function dispatch(actionName: string, args: unknown): Promise<DispatchResult> {
  const action = (Actions as Record<string, any>)[actionName];
  if (!action || typeof action.handler !== "function") {
    return { status: 404, body: { error: `Aksi tidak dikenal: ${actionName}` } };
  }
  try {
    const parsedArgs = action.request.parse(args ?? {});
    const result = await action.handler(ctx, parsedArgs);
    const data = action.response.parse(result);
    return { status: 200, body: { data } };
  } catch (e: any) {
    const isZod =
      e?.name === "ZodError" || (e && typeof e === "object" && Array.isArray((e as any).issues));
    const message = e?.message ? String(e.message) : String(e);
    // 400 = args tidak lolos validasi zod; 500 = handler gagal.
    return { status: isZod ? 400 : 500, body: { error: message } };
  }
}

function countPegawai(): number {
  const row = sqlite.query("SELECT COUNT(*) AS n FROM pegawai").get() as { n: number };
  return row.n;
}

// Seed otomatis: bila tabel pegawai kosong dan seed-data-asn.json ada,
// isi lewat handler seedPegawai yang sama (logika mengabdi tidak ditulis ulang).
if (countPegawai() === 0) {
  const seedPath = join(ROOT, "seed-data-asn.json");
  if (existsSync(seedPath)) {
    const records = JSON.parse(readFileSync(seedPath, "utf8"));
    const res = await dispatch("seedPegawai", { records });
    if (res.status === 200) {
      console.log(`Seed otomatis: ${(res.body.data as { inserted: number }).inserted} pegawai diimpor.`);
    } else {
      console.error("Seed otomatis gagal:", res.body.error);
    }
  }
}

// ---------- HTTP: file statis + /actions ----------
function contentTypeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/auth/")) {
      const authRes = await handleAuthRequest(req, url, sqlite);
      if (authRes) return authRes;
    }

    if (url.pathname === "/actions" && req.method === "POST") {
      if (!getSessionUser(req, sqlite)) {
        return Response.json(
          { error: "Sesi belum masuk atau sudah berakhir. Silakan masuk kembali." },
          { status: 401 },
        );
      }
      let payload: any;
      try {
        payload = await req.json();
      } catch {
        return Response.json({ error: "Body harus JSON." }, { status: 400 });
      }
      const res = await dispatch(String(payload?.action ?? ""), payload?.args ?? {});
      return Response.json(res.body, { status: res.status });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method tidak didukung.", { status: 405 });
    }

    // File statis dari client/dist/ (SPA fallback ke index.html).
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (rel === "") rel = "index.html";
    let filePath = resolve(join(DIST_DIR, rel));
    if (!filePath.startsWith(DIST_DIR + sep) && filePath !== DIST_DIR) {
      return new Response("Tidak ditemukan.", { status: 404 });
    }
    if (!existsSync(filePath) || !Bun.file(filePath).size) {
      filePath = join(DIST_DIR, "index.html");
    }
    if (!existsSync(filePath)) {
      return new Response(
        "Build client belum ada. Jalankan dulu: bun run build",
        { status: 500 },
      );
    }
    return new Response(Bun.file(filePath), {
      headers: { "content-type": contentTypeFor(filePath) },
    });
  },
});

console.log(
  `Sistem Kepegawaian Disperkimtan jalan di http://localhost:${server.port} — ${countPegawai()} pegawai.`,
);
console.log("Tekan Ctrl+C untuk berhenti.");
