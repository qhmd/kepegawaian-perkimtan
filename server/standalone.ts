// Server standalone untuk Sistem Kepegawaian Disperkimtan.
//
// Menjalankan aplikasi secara lokal (app.db) atau tersambung ke Turso jika
// TURSO_DATABASE_URL diatur. Jalankan: `bun run start` (atau JALANKAN.bat).

import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { countPegawai, getRuntimeDb } from "./db";
import { handleApiRequest } from "./handler";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "client", "dist");
const PORT = Number(process.env.KEPEGAWAIAN_PORT ?? 4173);

const runtime = await getRuntimeDb(ROOT);

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
    const apiRes = await handleApiRequest(req, ROOT);
    if (apiRes) return apiRes;

    const url = new URL(req.url);
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

const total = await countPegawai(runtime.sql);
console.log(
  `Sistem Kepegawaian Disperkimtan jalan di http://localhost:${server.port} (${runtime.isTurso ? "Turso" : "app.db"}) — ${total} pegawai.`,
);
console.log("Tekan Ctrl+C untuk berhenti.");
