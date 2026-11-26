import { getSessionUser, handleAuthRequest } from "./auth";
import { dispatchAction, getRuntimeDb } from "./db";

export async function handleApiRequest(req: Request, rootDir: string): Promise<Response | null> {
  const url = new URL(req.url);
  const { sql, drizzleDb } = await getRuntimeDb(rootDir);

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

  return null;
}
