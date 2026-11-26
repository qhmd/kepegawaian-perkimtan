import { handleApiRequest } from "../server/handler";

export default {
  async fetch(req: Request): Promise<Response> {
    try {
      const res = await handleApiRequest(req, process.cwd());
      if (res) return res;
      return Response.json({ error: "Endpoint tidak ditemukan." }, { status: 404 });
    } catch (err: any) {
      console.error("[VERCEL API ERROR]", err);
      return Response.json(
        { error: err?.message ? String(err.message) : "Terjadi kesalahan pada server." },
        { status: 500 },
      );
    }
  },
};
