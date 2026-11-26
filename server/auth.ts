import type { Database } from "bun:sqlite";
import { createHash, randomBytes, randomInt } from "node:crypto";
import tls from "node:tls";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  hasGoogle: boolean;
}

const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 15 * 60 * 1000;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function cookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function isSecureReq(req: Request): boolean {
  const url = new URL(req.url);
  return url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

function createSession(db: Database, userId: number): string {
  const sid = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    sid,
    userId,
    expiresAt,
  );
  return sid;
}

export function getSessionUser(req: Request, db: Database): AuthUser | null {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;

  const row = db
    .query(
      `SELECT u.id, u.email, u.name, u.role, u.google_id, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sid) as {
    id: number;
    email: string;
    name: string;
    role: string;
    google_id: string | null;
    expires_at: number;
  } | null;

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.query("DELETE FROM sessions WHERE id = ?").run(sid);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    hasGoogle: Boolean(row.google_id),
  };
}

function countUsers(db: Database): number {
  const row = db.query("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n;
}

function isEmailResetEnabled(): boolean {
  return Boolean(
    (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  );
}

/** Kirim email lewat SMTP TLS port 465 (gratis dengan Gmail App Password). */
async function sendSmtpMail(to: string, subject: string, body: string): Promise<void> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || "").trim();
  const rawPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
  const pass = process.env.SMTP_PASS ? rawPass : rawPass.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("Konfigurasi SMTP belum diisi.");

  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: true });
    let buffer = "";
    let step = 0;

    const sendLine = (line: string) => socket.write(`${line}\r\n`);

    socket.on("error", (err) => reject(err));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line || /^\d{3}-/.test(line)) continue;
        const code = Number(line.slice(0, 3));
        if (code >= 400) {
          socket.destroy();
          reject(new Error(`SMTP error ${line}`));
          return;
        }
        if (step === 0) {
          step = 1;
          sendLine(`EHLO localhost`);
        } else if (step === 1) {
          step = 2;
          sendLine(`AUTH LOGIN`);
        } else if (step === 2) {
          step = 3;
          sendLine(Buffer.from(user).toString("base64"));
        } else if (step === 3) {
          step = 4;
          sendLine(Buffer.from(pass).toString("base64"));
        } else if (step === 4) {
          step = 5;
          sendLine(`MAIL FROM:<${user}>`);
        } else if (step === 5) {
          step = 6;
          sendLine(`RCPT TO:<${to}>`);
        } else if (step === 6) {
          step = 7;
          sendLine(`DATA`);
        } else if (step === 7) {
          step = 8;
          const msg = [
            `From: Sistem Kepegawaian Disperkimtan <${user}>`,
            `To: <${to}>`,
            `Subject: ${subject}`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            body,
            `.`,
          ].join("\r\n");
          socket.write(`${msg}\r\n`);
        } else if (step === 8) {
          step = 9;
          sendLine(`QUIT`);
          socket.end();
          resolve();
        }
      }
    });
  });
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type MailSender = (to: string, subject: string, body: string) => Promise<void>;

export async function handleAuthRequest(
  req: Request,
  url: URL,
  db: Database,
  mailSender: MailSender = sendSmtpMail,
): Promise<Response | null> {
  const secure = isSecureReq(req);

  if (url.pathname === "/auth/me" && req.method === "GET") {
    const user = getSessionUser(req, db);
    return Response.json({
      user,
      hasUsers: countUsers(db) > 0,
      emailResetEnabled: isEmailResetEnabled(),
    });
  }

  if (url.pathname === "/auth/register-request" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Data tidak valid." }, { status: 400 });
    }
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (name.length < 2) {
      return Response.json({ error: "Nama lengkap minimal 2 huruf." }, { status: 400 });
    }
    if (!validEmail(email)) {
      return Response.json({ error: "Format email tidak valid." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Kata sandi minimal 6 karakter." }, { status: 400 });
    }

    const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return Response.json(
        { error: "Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa Kata Sandi." },
        { status: 409 },
      );
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = Date.now() + RESET_TTL_MS;
    db.query("UPDATE email_verifications SET used = 1 WHERE email = ? AND used = 0").run(email);
    db.query("INSERT INTO email_verifications (email, code_hash, expires_at, used) VALUES (?, ?, ?, 0)").run(
      email,
      sha256(code),
      expiresAt,
    );

    if (isEmailResetEnabled()) {
      try {
        await mailSender(
          email,
          "Kode Verifikasi Pendaftaran - Sistem Kepegawaian Disperkimtan",
          [
            `Halo ${name},`,
            ``,
            `Berikut kode verifikasi untuk membuat akun di Sistem Kepegawaian Disperkimtan:`,
            ``,
            `  Kode Verifikasi: ${code}`,
            ``,
            `Kode ini berlaku selama 15 menit. Jangan bagikan kode ini kepada siapa pun.`,
          ].join("\n"),
        );
        return Response.json({
          ok: true,
          emailSent: true,
          message: `Kode verifikasi 6 digit sudah dikirim ke ${email}. Periksa kotak masuk atau folder spam.`,
        });
      } catch (err) {
        console.error("[VERIFIKASI DAFTAR] Gagal kirim email:", err);
        return Response.json(
          { error: "Gagal mengirim email verifikasi. Pastikan alamat email aktif dan coba lagi." },
          { status: 502 },
        );
      }
    }

    console.log(`\n[VERIFIKASI DAFTAR] Email: ${email} | Kode 6 digit: ${code} (berlaku 15 menit)\n`);
    return Response.json({
      ok: true,
      emailSent: false,
      message: "Email server belum diatur. Kode verifikasi 6 digit ditampilkan di jendela terminal JALANKAN.bat.",
    });
  }

  if (url.pathname === "/auth/register" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Data tidak valid." }, { status: 400 });
    }
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const code = String(body?.code ?? "").trim();

    if (name.length < 2) {
      return Response.json({ error: "Nama lengkap minimal 2 huruf." }, { status: 400 });
    }
    if (!validEmail(email)) {
      return Response.json({ error: "Format email tidak valid." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Kata sandi minimal 6 karakter." }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
      return Response.json({ error: "Kode verifikasi harus 6 digit angka." }, { status: 400 });
    }

    const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return Response.json(
        { error: "Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa Kata Sandi." },
        { status: 409 },
      );
    }

    const verif = db
      .query(
        `SELECT id, code_hash, expires_at, used
         FROM email_verifications
         WHERE email = ? AND used = 0
         ORDER BY id DESC LIMIT 1`,
      )
      .get(email) as { id: number; code_hash: string; expires_at: number; used: number } | null;

    if (!verif || verif.expires_at < Date.now() || verif.code_hash !== sha256(code)) {
      return Response.json({ error: "Kode verifikasi salah atau sudah kedaluwarsa." }, { status: 400 });
    }

    db.query("UPDATE email_verifications SET used = 1 WHERE id = ?").run(verif.id);

    const role = countUsers(db) === 0 ? "Admin Kepegawaian" : "Operator";
    const passwordHash = await Bun.password.hash(password);
    const createdAt = new Date().toISOString();

    const info = db
      .query(
        "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(email, name, passwordHash, role, createdAt);

    const userId = Number(info.lastInsertRowid);
    const sid = createSession(db, userId);

    return Response.json(
      { user: { id: userId, email, name, role, hasGoogle: false } },
      {
        status: 201,
        headers: {
          "Set-Cookie": cookieHeader(SESSION_COOKIE, sid, SESSION_TTL_MS / 1000, secure),
        },
      },
    );
  }

  if (url.pathname === "/auth/login" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Data tidak valid." }, { status: 400 });
    }
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!validEmail(email) || !password) {
      return Response.json({ error: "Email dan kata sandi wajib diisi." }, { status: 400 });
    }

    const row = db
      .query("SELECT id, email, name, password_hash, google_id, role FROM users WHERE email = ?")
      .get(email) as {
      id: number;
      email: string;
      name: string;
      password_hash: string | null;
      google_id: string | null;
      role: string;
    } | null;

    if (!row) {
      return Response.json({ error: "Email atau kata sandi salah." }, { status: 401 });
    }
    if (!row.password_hash) {
      return Response.json(
        {
          error:
            "Akun ini terdaftar lewat Google. Klik Masuk dengan Google atau buat kata sandi lewat Lupa Kata Sandi.",
        },
        { status: 401 },
      );
    }

    const valid = await Bun.password.verify(password, row.password_hash);
    if (!valid) {
      return Response.json({ error: "Email atau kata sandi salah." }, { status: 401 });
    }

    const sid = createSession(db, row.id);
    return Response.json(
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          hasGoogle: Boolean(row.google_id),
        },
      },
      {
        headers: {
          "Set-Cookie": cookieHeader(SESSION_COOKIE, sid, SESSION_TTL_MS / 1000, secure),
        },
      },
    );
  }

  if (url.pathname === "/auth/logout" && req.method === "POST") {
    const cookies = parseCookies(req);
    const sid = cookies[SESSION_COOKIE];
    if (sid) {
      db.query("DELETE FROM sessions WHERE id = ?").run(sid);
    }
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": cookieHeader(SESSION_COOKIE, "", 0, secure),
        },
      },
    );
  }

  if (url.pathname === "/auth/forgot-password" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Data tidak valid." }, { status: 400 });
    }
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!validEmail(email)) {
      return Response.json({ error: "Masukkan alamat email yang valid." }, { status: 400 });
    }

    const row = db
      .query("SELECT id, email, name FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; name: string } | null;

    if (!row) {
      return Response.json(
        { error: "Email tersebut belum terdaftar di sistem ini." },
        { status: 404 },
      );
    }

    const code = String(randomInt(100000, 999999));
    const expiresAt = Date.now() + RESET_TTL_MS;
    db.query("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(row.id);
    db.query("INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, ?)").run(
      row.id,
      sha256(code),
      expiresAt,
    );

    if (isEmailResetEnabled()) {
      try {
        await sendSmtpMail(
          row.email,
          "Kode Reset Kata Sandi - Sistem Kepegawaian Disperkimtan",
          `Halo ${row.name},\n\nKode reset kata sandi Anda adalah: ${code}\nKode ini berlaku selama 15 menit.\n\nJika Anda tidak meminta reset kata sandi, abaikan email ini.`,
        );
        return Response.json({
          ok: true,
          delivery: "email",
          message: `Kode 6 digit sudah dikirim ke ${row.email}. Periksa kotak masuk atau folder spam.`,
        });
      } catch (err) {
        console.error("Gagal kirim email reset, beralih ke log server:", err);
      }
    }

    console.log(
      `\n[RESET KATA SANDI] Email: ${row.email} | Kode: ${code} (berlaku 15 menit)\n`,
    );
    return Response.json({
      ok: true,
      delivery: "console",
      message:
        "Kode 6 digit sudah dibuat. Karena email SMTP belum diatur, lihat kode pada jendela hitam server (JALANKAN.bat).",
    });
  }

  if (url.pathname === "/auth/reset-password" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Data tidak valid." }, { status: 400 });
    }
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();
    const newPassword = String(body?.newPassword ?? "");

    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
      return Response.json({ error: "Email dan kode 6 digit wajib diisi dengan benar." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return Response.json({ error: "Kata sandi baru minimal 6 karakter." }, { status: 400 });
    }

    const user = db
      .query("SELECT id, email, name, google_id, role FROM users WHERE email = ?")
      .get(email) as {
      id: number;
      email: string;
      name: string;
      google_id: string | null;
      role: string;
    } | null;

    if (!user) {
      return Response.json({ error: "Kode reset tidak valid atau sudah kedaluwarsa." }, { status: 400 });
    }

    const reset = db
      .query(
        `SELECT id, expires_at FROM password_resets
         WHERE user_id = ? AND code_hash = ? AND used = 0
         ORDER BY id DESC LIMIT 1`,
      )
      .get(user.id, sha256(code)) as { id: number; expires_at: number } | null;

    if (!reset || reset.expires_at < Date.now()) {
      return Response.json({ error: "Kode reset tidak valid atau sudah kedaluwarsa." }, { status: 400 });
    }

    const passwordHash = await Bun.password.hash(newPassword);
    db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
    db.query("UPDATE password_resets SET used = 1 WHERE id = ?").run(reset.id);

    const sid = createSession(db, user.id);
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          hasGoogle: Boolean(user.google_id),
        },
      },
      {
        headers: {
          "Set-Cookie": cookieHeader(SESSION_COOKIE, sid, SESSION_TTL_MS / 1000, secure),
        },
      },
    );
  }

  return null;
}
