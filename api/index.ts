import { getSessionUser, handleAuthRequest } from "../server/auth";
import { dispatchAction } from "../server/db-core";
import { getTursoDb } from "../server/db-turso";

async function handle(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const { sql, drizzleDb } = await getTursoDb(process.cwd());

    if (url.pathname.startsWith("/auth/")) {
      const authRes = await handleAuthRequest(req, url, sql);
      if (authRes) return authRes;
    }

    if (url.pathname === "/actions" && req.method === "POST") {
      if (!(await getSessionUser(req, sql))) {
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
      const res = await dispatchAction(drizzleDb, String(payload?.action ?? ""), payload?.args ?? {});
      return Response.json(res.body, { status: res.status });
    }

    return Response.json({ error: "Endpoint tidak ditemukan." }, { status: 404 });
  } catch (err: any) {
    console.error("[VERCEL API ERROR]", err);
    return Response.json(
      { error: err?.message ? String(err.message) : "Terjadi kesalahan pada server." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

export async function HEAD(req: Request): Promise<Response> {
  return handle(req);
}
