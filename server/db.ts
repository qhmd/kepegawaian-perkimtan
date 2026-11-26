import { join } from "node:path";
import { ensureSchemaAndSeed, type RuntimeDb, type SqlClient } from "./db-core";
import { getTursoDb } from "./db-turso";

export { countPegawai, dispatchAction, type RuntimeDb, type SqlClient } from "./db-core";

/** Pembungkus sinkron bun:sqlite agar kompatibel dengan antarmuka async SqlClient. */
export function wrapBunSqlite(sqlite: {
  query: (sql: string) => { get: (...args: any[]) => any; run: (...args: any[]) => any };
  exec: (sql: string) => void;
}): SqlClient {
  return {
    async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const row = sqlite.query(sql).get(...params);
      return (row ?? null) as T | null;
    },
    async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number }> {
      const info = sqlite.query(sql).run(...params);
      return { lastInsertRowid: Number(info?.lastInsertRowid ?? 0) };
    },
    async exec(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
  };
}

let cachedPromise: Promise<RuntimeDb> | null = null;

export function getRuntimeDb(rootDir: string): Promise<RuntimeDb> {
  const tursoUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || "").trim();
  if (tursoUrl) {
    return getTursoDb(rootDir);
  }
  if (!cachedPromise) {
    cachedPromise = initLocalDb(rootDir).catch((err) => {
      cachedPromise = null;
      throw err;
    });
  }
  return cachedPromise;
}

async function initLocalDb(rootDir: string): Promise<RuntimeDb> {
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const sqlite = new Database(join(rootDir, "app.db"));
  const sql = wrapBunSqlite(sqlite);
  const drizzleDb = drizzle(sqlite) as any;

  if (typeof drizzleDb.batch !== "function") {
    drizzleDb.batch = async (items: any[]) => {
      const out: unknown[] = [];
      for (const item of items) {
        out.push(await item);
      }
      return out;
    };
  }

  await ensureSchemaAndSeed(sql, drizzleDb, rootDir);
  return { sql, drizzleDb, isTurso: false };
}
