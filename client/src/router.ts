import { useCallback, useEffect, useState } from "react";

export type Tab = "dashboard" | "pegawai" | "pensiun" | "berkala" | "pengaturan" | "catatan";
export type AuthMode = "login" | "register" | "forgot";

export const TAB_PATHS: Record<Tab, string> = {
  dashboard: "/",
  pegawai: "/pegawai",
  pensiun: "/pensiun",
  berkala: "/berkala",
  pengaturan: "/pengaturan",
  catatan: "/aturan",
};

export const AUTH_PATHS: Record<AuthMode, string> = {
  login: "/masuk",
  register: "/daftar",
  forgot: "/lupa-sandi",
};

const PATH_TO_TAB: Record<string, Tab> = {
  "/": "dashboard",
  "/beranda": "dashboard",
  "/pegawai": "pegawai",
  "/pensiun": "pensiun",
  "/berkala": "berkala",
  "/pengaturan": "pengaturan",
  "/aturan": "catatan",
};

const PATH_TO_AUTH: Record<string, AuthMode> = {
  "/masuk": "login",
  "/daftar": "register",
  "/lupa-sandi": "forgot",
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

export function tabFromPath(pathname: string): Tab | null {
  return PATH_TO_TAB[normalizePath(pathname)] ?? null;
}

export function authModeFromPath(pathname: string): AuthMode | null {
  return PATH_TO_AUTH[normalizePath(pathname)] ?? null;
}

export function navigate(to: string, replace = false) {
  if (typeof window === "undefined") return;
  const target = normalizePath(to);
  const current = normalizePath(window.location.pathname);
  if (target === current) return;
  if (replace) {
    window.history.replaceState({}, "", target);
  } else {
    window.history.pushState({}, "", target);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === "undefined" ? "/" : normalizePath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return pathname;
}

export function useNavigate() {
  return useCallback((to: string, replace = false) => {
    navigate(to, replace);
  }, []);
}
