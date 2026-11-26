import { createClient, type Client, type InValue } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { ensureSchemaAndSeed, type RuntimeDb, type SqlClient } from "./db-core";

export function wrapLibsql(client: Client): SqlClient {
  return {
    async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const res = await client.execute({ sql, args: params as InValue[] });
      const row = res.rows[0];
      if (!row) return null;
      return { ...row } as unknown as T;
    },
    async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number }> {
      const res = await client.execute({ sql, args: params as InValue[] });
      return { lastInsertRowid: Number(res.lastInsertRowid ?? 0) };
    },
    async exec(sql: string): Promise<void> {
      await client.executeMultiple(sql);
    },
  };
}

let tursoPromise: Promise<RuntimeDb> | null = null;

export function getTursoDb(rootDir: string): Promise<RuntimeDb> {
  if (!tursoPromise) {
    tursoPromise = initTursoDb(rootDir).catch((err) => {
      tursoPromise = null;
      throw err;
    });
  }
  return tursoPromise;
}

async function initTursoDb(rootDir: string): Promise<RuntimeDb> {
  const url = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || "").trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "").trim();
  if (!url) {
    throw new Error("TURSO_DATABASE_URL belum diatur.");
  }
  const client = createClient({ url, authToken: authToken || undefined });
  const sql = wrapLibsql(client);
  const drizzleDb = drizzleLibsql(client);
  await ensureSchemaAndSeed(sql, drizzleDb, rootDir);
  return { sql, drizzleDb, isTurso: true };
}
