import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { hitungPensiun } from "../client/src/hitung";
import {
  buildPegawaiWorkbook,
  buildPensiunWorkbook,
  parseExcelDate,
  parseExcelPegawai,
  TEMPLATE_HEADERS,
} from "../client/src/excelPegawai";
import { Actions } from "../server/src/actions";
import { getSessionUser, handleAuthRequest } from "../server/auth";

const ROOT = join(import.meta.dir, "..");

function createTestDb() {
  const sqlite = new Database(":memory:");
  for (const rel of ["drizzle/0001_initial.sql", "drizzle/0002_pegawai_dan_pengaturan.sql", "drizzle/0003_auth.sql"]) {
    const sql = readFileSync(join(ROOT, rel), "utf8");
    for (const part of sql.split(/^--> statement-breakpoint$/m)) {
      const stmt = part.trim();
      if (stmt) sqlite.exec(stmt);
    }
  }
  const db = drizzle(sqlite);
  const ctx = { db: () => db as any, invalidateQueries: () => {} };
  return { sqlite, db, ctx };
}

describe("Perhitungan Pensiun", () => {
  it("menghitung masa kerja pensiun tanpa masa mengabdi", () => {
    const res = hitungPensiun({
      lahir: "1970-05-15",
      gol: "III/d",
      bup: 58,
      cpns: "2000-03-01",
      mkTercatatThn: 20,
      mkTercatatBln: 0,
      mengabdiThn: 5,
      mengabdiBln: 6,
      tmtKgbTerakhir: null,
    });
    expect(res.tahunPensiun).toBe(2028);
    expect(res.tmtPensiun).toBe("2028-06-01");
    expect(res.masaKerjaThn).toBe(28);
    expect(res.masaKerjaBln).toBe(3);
  });
});

describe("Template & Import Excel", () => {
  it("mem-parsing berbagai format tanggal Excel dengan benar", () => {
    expect(parseExcelDate("1990-01-15")).toBe("1990-01-15");
    expect(parseExcelDate("15-01-1990")).toBe("1990-01-15");
    expect(parseExcelDate(new Date(1990, 0, 15))).toBe("1990-01-15");
    expect(parseExcelDate("bukan-tanggal")).toBeNull();
  });

  it("memvalidasi baris valid dan melaporkan baris bermasalah", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [...TEMPLATE_HEADERS],
      ["199001152015031002", "BUDI TEST", "1990-01-15", "III/c", "2023-04-01", "ANALIS", "Non Eselon", 58, "2015-03-01", 10, 5, "", "Bidang A"],
      ["199102202016031001", "SITI TEST", "20-02-1991", "III/b", "01-04-2024", "STAF", "", 58, "01-03-2016", 9, 2, "01-03-2024", "Bidang B"],
      ["", "TANPA NIP", "bad-date", "III/a", "2020-01-01", "", "", 58, "2018-01-01", 0, 0, "", ""],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Data Pegawai");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const parsed = parseExcelPegawai(buf);
    expect(parsed.totalRows).toBe(3);
    expect(parsed.valid.length).toBe(2);
    expect(parsed.errors.length).toBe(1);
    expect(parsed.errors[0]?.row).toBe(4);
    expect(parsed.valid[1]?.lahir).toBe("1991-02-20");
    expect(parsed.valid[1]?.tmtKgbTerakhir).toBe("2024-03-01");
  });

  it("mengekspor data pegawai dan pensiun ke workbook Excel yang dapat dibaca ulang", () => {
    const wbPegawai = buildPegawaiWorkbook([
      {
        nip: "199001152015031002",
        nama: "BUDI EXPORT",
        lahir: "1990-01-15",
        gol: "III/c",
        tmtGol: "2023-04-01",
        jabatan: "ANALIS",
        eselon: "",
        bup: 58,
        cpns: "2015-03-01",
        mkTercatatThn: 10,
        mkTercatatBln: 5,
        tmtKgbTerakhir: null,
        unit: "Bidang A",
      },
    ]);
    const buf = XLSX.write(wbPegawai, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const reimported = parseExcelPegawai(buf);
    expect(reimported.valid.length).toBe(1);
    expect(reimported.valid[0]?.nip).toBe("199001152015031002");
    expect(reimported.valid[0]?.nama).toBe("BUDI EXPORT");

    const wbPensiun = buildPensiunWorkbook([
      {
        nama: "BUDI EXPORT",
        nip: "199001152015031002",
        jabatan: "ANALIS",
        tahunPensiun: 2048,
        tmtPensiun: "01-02-2048",
        masaKerjaText: "32 thn 11 bln",
      },
    ]);
    expect(wbPensiun.SheetNames).toContain("Daftar Pensiun");
    const sheet = wbPensiun.Sheets["Daftar Pensiun"];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet!, { header: 1 });
    expect(rows.length).toBe(2);
    expect(rows[1]?.[1]).toBe("BUDI EXPORT");
  });
});

describe("Actions CRUD & Import Pegawai", () => {
  it("menambah, mengimpor (skip/update), mengubah, dan menghapus pegawai", async () => {
    const { ctx } = createTestDb();
    const added = await Actions.addPegawai.handler(ctx, Actions.addPegawai.request.parse({
      nip: "199001152015031002",
      nama: "BUDI TEST",
      lahir: "1990-01-15",
      gol: "III/c",
      tmtGol: "2023-04-01",
      jabatan: "ANALIS",
      eselon: "",
      bup: 58,
      cpns: "2015-03-01",
      mkTercatatThn: 10,
      mkTercatatBln: 5,
      tmtKgbTerakhir: null,
      unit: "Bidang A",
      perluVerifikasi: false,
    }));
    expect(added.id).toBeGreaterThan(0);

    const impSkip = await Actions.importPegawai.handler(ctx, Actions.importPegawai.request.parse({
      mode: "skip",
      records: [
        {
          nip: "199001152015031002",
          nama: "BUDI UPDATED",
          lahir: "1990-01-15",
          gol: "III/d",
          tmtGol: "2023-04-01",
          jabatan: "ANALIS MADYA",
          eselon: "",
          bup: 58,
          cpns: "2015-03-01",
          mkTercatatThn: 10,
          mkTercatatBln: 5,
          tmtKgbTerakhir: null,
          unit: "Bidang A",
          perluVerifikasi: false,
        },
        {
          nip: "199102202016031001",
          nama: "SITI TEST",
          lahir: "1991-02-20",
          gol: "III/b",
          tmtGol: "2024-04-01",
          jabatan: "STAF",
          eselon: "",
          bup: 58,
          cpns: "2016-03-01",
          mkTercatatThn: 9,
          mkTercatatBln: 2,
          tmtKgbTerakhir: null,
          unit: "Bidang B",
          perluVerifikasi: false,
        },
      ],
    }));
    expect(impSkip).toEqual({ inserted: 1, updated: 0, skipped: 1 });

    const impUpd = await Actions.importPegawai.handler(ctx, Actions.importPegawai.request.parse({
      mode: "update",
      records: [
        {
          nip: "199001152015031002",
          nama: "BUDI UPDATED",
          lahir: "1990-01-15",
          gol: "III/d",
          tmtGol: "2023-04-01",
          jabatan: "ANALIS MADYA",
          eselon: "",
          bup: 58,
          cpns: "2015-03-01",
          mkTercatatThn: 10,
          mkTercatatBln: 5,
          tmtKgbTerakhir: null,
          unit: "Bidang A",
          perluVerifikasi: false,
        },
      ],
    }));
    expect(impUpd).toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const state = await Actions.getState.handler(ctx, {});
    expect(state.pegawai.length).toBe(2);
    const budi = state.pegawai.find((p) => p.nip === "199001152015031002");
    expect(budi?.nama).toBe("BUDI UPDATED");

    await Actions.deletePegawai.handler(ctx, { id: budi!.id });
    const afterDel = await Actions.getState.handler(ctx, {});
    expect(afterDel.pegawai.length).toBe(1);
  });
});

describe("Autentikasi (Verifikasi Email, Register, Login, Session, Logout)", () => {
  it("mewajibkan kode verifikasi email saat buat akun dan mengelola sesi dengan benar", async () => {
    const { sqlite } = createTestDb();
    let capturedCode = "";
    const fakeMail = async (_to: string, _subject: string, body: string) => {
      const m = body.match(/Kode Verifikasi:\s*(\d{6})/);
      if (m?.[1]) capturedCode = m[1];
    };

    // 1. Daftar tanpa kode harus ditolak
    const noCodeReq = new Request("http://localhost:4173/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Uji", email: "uji@disperkimtan.go.id", password: "password123" }),
    });
    const noCodeRes = await handleAuthRequest(noCodeReq, new URL(noCodeReq.url), sqlite, fakeMail);
    expect(noCodeRes?.status).toBe(400);

    // 2. Minta kode verifikasi
    const reqCode = new Request("http://localhost:4173/auth/register-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Uji", email: "uji@disperkimtan.go.id", password: "password123" }),
    });
    const reqCodeRes = await handleAuthRequest(reqCode, new URL(reqCode.url), sqlite, fakeMail);
    expect(reqCodeRes?.status).toBe(200);
    expect(capturedCode).toMatch(/^\d{6}$/);

    // 3. Kode salah harus ditolak
    const wrongCodeReq = new Request("http://localhost:4173/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Uji", email: "uji@disperkimtan.go.id", password: "password123", code: "000000" }),
    });
    const wrongCodeRes = await handleAuthRequest(wrongCodeReq, new URL(wrongCodeReq.url), sqlite, fakeMail);
    expect(wrongCodeRes?.status).toBe(400);

    // 4. Kode benar berhasil membuat akun + sesi
    const regReq = new Request("http://localhost:4173/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Uji", email: "uji@disperkimtan.go.id", password: "password123", code: capturedCode }),
    });
    const regRes = await handleAuthRequest(regReq, new URL(regReq.url), sqlite, fakeMail);
    expect(regRes?.status).toBe(201);
    const cookie = regRes?.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie.startsWith("sid=")).toBe(true);

    const meReq = new Request("http://localhost:4173/auth/me", { headers: { cookie } });
    expect(getSessionUser(meReq, sqlite)?.email).toBe("uji@disperkimtan.go.id");

    const logoutReq = new Request("http://localhost:4173/auth/logout", { method: "POST", headers: { cookie } });
    await handleAuthRequest(logoutReq, new URL(logoutReq.url), sqlite, fakeMail);
    expect(getSessionUser(meReq, sqlite)).toBeNull();

    const loginReq = new Request("http://localhost:4173/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "uji@disperkimtan.go.id", password: "password123" }),
    });
    const loginRes = await handleAuthRequest(loginReq, new URL(loginReq.url), sqlite, fakeMail);
    expect(loginRes?.status).toBe(200);
  });
});
