import { useEffect, useState, type FormEvent } from "react";
import { AUTH_PATHS, authModeFromPath, navigate, usePathname, type AuthMode } from "./router";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthStatus {
  user: AuthUser | null;
  hasUsers: boolean;
  emailResetEnabled: boolean;
}

const inputClass =
  "w-full rounded-lg border border-[#cbd5e1] bg-[#f8fafc] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[#94a3b8] focus:border-[var(--accent)] focus:bg-white";

function useWaktuSekarang(): { tanggal: string; jam: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return {
    tanggal: now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    jam: now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export function AuthScreen({
  status,
  onSuccess,
}: {
  status: AuthStatus;
  onSuccess: () => void;
}) {
  const pathname = usePathname();
  const defaultMode: AuthMode = status.hasUsers ? "login" : "register";
  const mode: AuthMode = authModeFromPath(pathname) ?? defaultMode;
  const waktu = useWaktuSekarang();

  useEffect(() => {
    if (!authModeFromPath(pathname)) {
      navigate(AUTH_PATHS[defaultMode], true);
    }
  }, [pathname, defaultMode]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [regStep, setRegStep] = useState<"request" | "confirm">("request");
  const [regCode, setRegCode] = useState("");

  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: AuthMode) {
    navigate(AUTH_PATHS[next]);
    setError(null);
    setInfo(null);
    if (next === "register") {
      setRegStep("request");
      setRegCode("");
    }
    if (next === "forgot") {
      setResetStep("request");
      setResetCode("");
      setNewPassword("");
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Gagal masuk. Periksa email dan kata sandi Anda.");
        return;
      }
      onSuccess();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRegisterCode() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/register-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Gagal mengirim kode verifikasi.");
        return;
      }
      setInfo(data.message);
      setRegStep("confirm");
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterRequest(e: FormEvent) {
    e.preventDefault();
    await requestRegisterCode();
  }

  async function handleRegisterConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, code: regCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Gagal membuat akun.");
        return;
      }
      onSuccess();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  async function requestForgotCode() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Gagal membuat kode reset.");
        return;
      }
      setInfo(data.message);
      setResetStep("confirm");
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotRequest(e: FormEvent) {
    e.preventDefault();
    await requestForgotCode();
  }

  async function handleResetConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan kata sandi baru.");
        return;
      }
      onSuccess();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Panel kiri: Identitas Instansi (Biru, Abu, Putih) */}
      <aside
        className="relative flex flex-col justify-between overflow-hidden px-6 py-8 text-white lg:w-[42%] lg:px-11 lg:py-10"
        style={{
          background: "#1d3049",
          borderRight: "1px solid #152438",
        }}
      >
        {/* Garis aksen biru di tepi atas */}
        <div className="absolute inset-x-0 top-0 h-1 bg-[#1f6fd0]" />

        {/* Ornamen kontur bidang tanah tipis (biru-putih) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -bottom-16 -right-16 h-96 w-96 opacity-[0.07]"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.2"
        >
          <path d="M30 370 L120 260 L260 285 L360 150" />
          <path d="M55 395 L150 290 L285 315 L390 190" />
          <path d="M110 200 L225 155 L330 195 L260 285 L120 260 Z" />
          <path d="M225 155 L265 55 L370 95 L330 195" />
        </svg>

        {/* Header Instansi */}
        <div className="relative z-10 pt-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9fc1e8]">
            Pemerintah Provinsi Sulawesi Selatan
          </p>
        </div>

        {/* Identitas Utama di Tengah */}
        <div className="relative z-10 my-10 lg:my-0">
          <img
            src="/logo-sulsel.png"
            alt="Lambang Provinsi Sulawesi Selatan"
            width={88}
            height={104}
            fetchPriority="high"
            className="mb-5 h-24 w-auto object-contain"
          />
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-[30px]">
            Sistem Kepegawaian
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#c7d3e2]">
            Dinas Perumahan, Kawasan Permukiman dan Pertanahan Provinsi Sulawesi Selatan
          </p>
        </div>

        {/* Informasi Inti */}
        <div className="relative z-10 hidden space-y-4 lg:block">
          <div className="border-t border-white/10 pt-4">
            <ul className="space-y-1.5 text-xs leading-relaxed text-[#c7d3e2]">
              <li>Pengelolaan data induk ASN (NIP, golongan, jabatan, TMT CPNS).</li>
              <li>Pemantauan jadwal pensiun pegawai sesuai batas usia pensiun.</li>
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#9fb2c9]">
            <span>Subbagian Umum & Kepegawaian</span>
            <span>{year}</span>
          </div>
        </div>
      </aside>

      {/* Panel kanan: Latar kontur pertanahan + utilitas waktu + kartu formulir */}
      <main className="bg-kontur flex flex-1 flex-col justify-between px-4 py-6 sm:px-10 sm:py-8">
        {/* Bar atas kanan: tanggal & jam nyata */}
        <div className="mx-auto flex w-full max-w-md items-center justify-between border-b border-[#d4dce6] pb-3 text-xs text-[#4b5b70]">
          <span>{waktu.tanggal}</span>
          <span className="font-semibold tabular-nums text-[#1c2530]">{waktu.jam}</span>
        </div>

        {/* Area formulir utama */}
        <div className="mx-auto my-8 w-full max-w-md">
          <div className="anim-masuk overflow-hidden rounded-xl border border-[#cfd8e3] bg-white shadow-[0_12px_34px_rgba(16,32,56,0.08)]">
            {/* Garis tipis penanda kartu utama */}
            <div className="h-1 bg-[var(--accent)]" />

            <div className="p-6 sm:p-7">
              <h2 className="font-display mb-4 text-xl font-bold text-[var(--text)]">
                {mode === "login"
                  ? "Masuk"
                  : mode === "register"
                    ? "Buat Akun"
                    : "Lupa Kata Sandi"}
              </h2>

              {!status.hasUsers && mode === "register" ? (
                <div
                  className="mb-4 rounded-[6px] border px-3.5 py-2.5 text-sm"
                  style={{
                    borderColor: "#bfdbfe",
                    background: "#eff6ff",
                    color: "#1e3a8a",
                  }}
                >
                  Belum ada akun terdaftar. Buat akun pertama untuk mulai menggunakan sistem.
                </div>
              ) : null}

              <div className="mb-5 grid grid-cols-3 gap-1 rounded-[6px] border border-[#e2e8f0] bg-[#f4f6f9] p-1">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="rounded-[4px] py-2 text-sm font-semibold"
                  style={{
                    background: mode === "login" ? "#ffffff" : "transparent",
                    color: mode === "login" ? "var(--accent)" : "#475569",
                    boxShadow: mode === "login" ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                  }}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="rounded-[4px] py-2 text-sm font-semibold"
                  style={{
                    background: mode === "register" ? "#ffffff" : "transparent",
                    color: mode === "register" ? "var(--accent)" : "#475569",
                    boxShadow: mode === "register" ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                  }}
                >
                  Buat Akun
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="rounded-[4px] py-2 text-sm font-semibold"
                  style={{
                    background: mode === "forgot" ? "#ffffff" : "transparent",
                    color: mode === "forgot" ? "var(--accent)" : "#475569",
                    boxShadow: mode === "forgot" ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                  }}
                >
                  Lupa Sandi
                </button>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="anim-panel mb-4 rounded-[6px] border px-3.5 py-2.5 text-sm font-medium"
                  style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
                >
                  {error}
                </div>
              ) : null}

              {info ? (
                <div
                  role="status"
                  className="anim-panel mb-4 rounded-[6px] border px-3.5 py-2.5 text-sm"
                  style={{ borderColor: "var(--ok)", background: "var(--ok-bg)", color: "var(--ok)" }}
                >
                  {info}
                </div>
              ) : null}

              <div key={`${mode}-${regStep}-${resetStep}`} className="anim-masuk">

              {mode === "login" ? (
                <form key="login" onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                      Alamat Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="email@contoh.go.id"
                      className={inputClass}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="login-password" className="text-sm font-semibold text-[var(--text)]">
                        Kata Sandi
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="min-h-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        {showPassword ? "Sembunyikan" : "Tampilkan"}
                      </button>
                    </div>
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      placeholder="Masukkan kata sandi"
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-[6px] px-4 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                  >
                    {busy ? "Memeriksa..." : "Masuk"}
                  </button>
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="min-h-0 text-sm font-medium text-[var(--accent)] hover:underline"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                </form>
              ) : null}

              {mode === "register" ? (
                regStep === "request" ? (
                  <form key="register-req" onSubmit={handleRegisterRequest} className="space-y-4">
                    <div>
                      <label htmlFor="reg-name" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                        Nama Lengkap
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        required
                        minLength={2}
                        autoComplete="name"
                        placeholder="Nama lengkap petugas"
                        className={inputClass}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-email" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                        Alamat Email
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="email@contoh.go.id"
                        className={inputClass}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="reg-password" className="text-sm font-semibold text-[var(--text)]">
                          Kata Sandi
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="min-h-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                        >
                          {showPassword ? "Sembunyikan" : "Tampilkan"}
                        </button>
                      </div>
                      <input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Minimal 6 huruf atau angka"
                        className={inputClass}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-[6px] px-4 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {busy ? "Mengirim kode..." : "Kirim Kode Verifikasi"}
                    </button>
                  </form>
                ) : (
                  <form key="register-confirm" onSubmit={handleRegisterConfirm} className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRegStep("request");
                          setInfo(null);
                          setError(null);
                        }}
                        className="min-h-0 rounded-[4px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[#eef2f6]"
                      >
                        Kembali
                      </button>
                      <span className="truncate text-xs text-[var(--dim)]">{email}</span>
                    </div>
                    <p className="text-sm text-[var(--dim)]">
                      Masukkan kode verifikasi 6 digit yang dikirim ke email Anda.
                    </p>
                    <div>
                      <label htmlFor="reg-code" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                        Kode Verifikasi 6 Digit
                      </label>
                      <input
                        id="reg-code"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        placeholder="6 digit angka"
                        className={inputClass}
                        value={regCode}
                        onChange={(e) => setRegCode(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-[6px] px-4 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {busy ? "Memverifikasi..." : "Verifikasi & Buat Akun"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestRegisterCode()}
                      className="w-full rounded-[6px] border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[#f8fafc] disabled:opacity-50"
                    >
                      {busy ? "Mengirim ulang..." : "Kirim Ulang Kode"}
                    </button>
                  </form>
                )
              ) : null}

              {mode === "forgot" ? (
                resetStep === "request" ? (
                  <form key="forgot-req" onSubmit={handleForgotRequest} className="space-y-4">
                    <div>
                      <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                        Alamat Email Terdaftar
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="email@contoh.go.id"
                        className={inputClass}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-[6px] px-4 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {busy ? "Membuat kode..." : "Kirim Kode Reset"}
                    </button>
                  </form>
                ) : (
                  <form key="forgot-confirm" onSubmit={handleResetConfirm} className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResetStep("request");
                          setInfo(null);
                          setError(null);
                        }}
                        className="min-h-0 rounded-[4px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[#eef2f6]"
                      >
                        Kembali
                      </button>
                      <span className="truncate text-xs text-[var(--dim)]">{email}</span>
                    </div>
                    <div>
                      <label htmlFor="reset-code" className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
                        Kode 6 Digit
                      </label>
                      <input
                        id="reset-code"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        placeholder="6 digit angka"
                        className={inputClass}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="reset-newpw" className="text-sm font-semibold text-[var(--text)]">
                          Kata Sandi Baru
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="min-h-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                        >
                          {showPassword ? "Sembunyikan" : "Tampilkan"}
                        </button>
                      </div>
                      <input
                        id="reset-newpw"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Minimal 6 karakter"
                        className={inputClass}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-[6px] px-4 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {busy ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestForgotCode()}
                      className="w-full rounded-[6px] border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[#f8fafc] disabled:opacity-50"
                    >
                      {busy ? "Mengirim ulang..." : "Kirim Ulang Kode"}
                    </button>
                  </form>
                )
              ) : null}
              </div>
              {mode === "forgot" && !status.emailResetEnabled ? (
                <p className="mt-4 text-xs text-[var(--dim)]">
                  Email server belum diatur di .env. Kode 6 digit akan muncul di jendela terminal JALANKAN.bat.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer panel kanan */}
        <footer className="mx-auto flex w-full max-w-md items-center justify-between border-t border-[#d4dce6] pt-3 text-xs text-[#5b6b80]">
          <span>Subbagian Umum & Kepegawaian</span>
          <span>Server Lokal</span>
        </footer>
      </main>
    </div>
  );
}
