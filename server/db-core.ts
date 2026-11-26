import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Actions } from "./src/actions";

export interface SqlClient {
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number }>;
  exec(sql: string): Promise<void>;
}

export interface RuntimeDb {
  sql: SqlClient;
  drizzleDb: any;
  isTurso: boolean;
}

async function tableExists(sql: SqlClient, name: string): Promise<boolean> {
  const row = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    [name],
  );
  return row !== null;
}

async function runMigrationFile(sql: SqlClient, rootDir: string, relPath: string) {
  const content = readFileSync(join(rootDir, relPath), "utf8");
  for (const part of content.split(/^--> statement-breakpoint$/m)) {
    const stmt = part.trim();
    if (stmt) await sql.exec(stmt);
  }
}

export async function ensureSchemaAndSeed(sql: SqlClient, drizzleDb: any, rootDir: string) {
  if (!(await tableExists(sql, "pegawai")) || !(await tableExists(sql, "settings"))) {
    await runMigrationFile(sql, rootDir, "drizzle/0001_initial.sql");
    await runMigrationFile(sql, rootDir, "drizzle/0002_pegawai_dan_pengaturan.sql");
  }

  if (
    !(await tableExists(sql, "users")) ||
    !(await tableExists(sql, "sessions")) ||
    !(await tableExists(sql, "password_resets"))
  ) {
    await runMigrationFile(sql, rootDir, "drizzle/0003_auth.sql");
  } else if (!(await tableExists(sql, "email_verifications"))) {
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  if ((await countPegawai(sql)) === 0) {
    const seedPath = join(rootDir, "seed-data-asn.json");
    if (existsSync(seedPath)) {
      const records = JSON.parse(readFileSync(seedPath, "utf8"));
      await dispatchAction(drizzleDb, "seedPegawai", { records });
    }
  }
}

export async function dispatchAction(
  drizzleDb: any,
  actionName: string,
  args: unknown,
): Promise<{ status: number; body: { data?: unknown; error?: string } }> {
  const action = (Actions as Record<string, any>)[actionName];
  if (!action || typeof action.handler !== "function") {
    return { status: 404, body: { error: `Aksi tidak dikenal: ${actionName}` } };
  }
  const ctx = { db: () => drizzleDb, invalidateQueries: () => {} };
  try {
    const parsedArgs = action.request.parse(args ?? {});
    const result = await action.handler(ctx, parsedArgs);
    const data = action.response.parse(result);
    return { status: 200, body: { data } };
  } catch (e: any) {
    const isZod =
      e?.name === "ZodError" || (e && typeof e === "object" && Array.isArray((e as any).issues));
    const message = e?.message ? String(e.message) : String(e);
    return { status: isZod ? 400 : 500, body: { error: message } };
  }
}

export async function countPegawai(sql: SqlClient): Promise<number> {
  const row = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM pegawai");
  return Number(row?.n ?? 0);
}
