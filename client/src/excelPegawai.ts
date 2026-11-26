import * as XLSX from "xlsx";

export interface PegawaiImportRecord {
  nip: string;
  nama: string;
  lahir: string;
  gol: string;
  tmtGol: string;
  jabatan: string;
  eselon: string;
  bup: number;
  cpns: string;
  mkTercatatThn: number;
  mkTercatatBln: number;
  mengabdiThn: number;
  mengabdiBln: number;
  tmtKgbTerakhir: string | null;
  unit: string;
  perluVerifikasi: boolean;
}

export interface ExcelParseError {
  row: number;
  message: string;
}

export interface ExcelParseResult {
  valid: PegawaiImportRecord[];
  errors: ExcelParseError[];
  totalRows: number;
}

export const TEMPLATE_HEADERS = [
  "NIP",
  "Nama Lengkap",
  "Tanggal Lahir",
  "Golongan",
  "TMT Golongan",
  "Jabatan",
  "Eselon",
  "BUP",
  "TMT CPNS",
  "MK Tercatat (Tahun)",
  "MK Tercatat (Bulan)",
  "TMT KGB Terakhir",
  "Unit Kerja",
] as const;

/** Buat dan unduh file template Excel (.xlsx) untuk pengisian data pegawai. */
export function unduhTemplateExcel(): void {
  const wb = XLSX.utils.book_new();

  const contohBaris = [
    "199001152015031002",
    "CONTOH: BUDI SANTOSO, S.T.",
    "1990-01-15",
    "III/c",
    "2023-04-01",
    "PENATA KELOLA BANGUNAN GEDUNG",
    "Non Eselon",
    58,
    "2015-03-01",
    11,
    8,
    "2025-03-01",
    "Bidang Penataan Bangunan",
  ];

  const wsData = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], contohBaris]);
  wsData["!cols"] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 15 },
    { wch: 11 },
    { wch: 15 },
    { wch: 34 },
    { wch: 14 },
    { wch: 8 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
  ];

  // Pastikan sel NIP di baris contoh bertipe teks agar tidak berubah menjadi notasi ilmiah
  if (wsData["A2"]) {
    wsData["A2"].t = "s";
    wsData["A2"].z = "@";
  }

  XLSX.utils.book_append_sheet(wb, wsData, "Data Pegawai");

  const petunjuk = [
    ["PETUNJUK PENGISIAN TEMPLATE DATA PEGAWAI DISPERKIMTAN"],
    [""],
    ["Kolom", "Wajib / Opsional", "Keterangan & Format"],
    ["NIP", "Wajib", "Nomor Induk Pegawai (18 digit). Gunakan format Text agar angka tidak berubah menjadi E+17."],
    ["Nama Lengkap", "Wajib", "Nama lengkap beserta gelar jika ada."],
    ["Tanggal Lahir", "Wajib", "Format YYYY-MM-DD (contoh: 1990-01-15) atau DD-MM-YYYY, atau sel tanggal Excel."],
    ["Golongan", "Wajib", "Contoh: II/c, III/a, III/d, IV/a."],
    ["TMT Golongan", "Wajib", "Format YYYY-MM-DD atau DD-MM-YYYY."],
    ["Jabatan", "Opsional", "Nama jabatan pegawai."],
    ["Eselon", "Opsional", "Contoh: II.a, III.a, IV.a, atau Non Eselon."],
    ["BUP", "Opsional", "Batas Usia Pensiun (angka 50 sampai 70, default 58)."],
    ["TMT CPNS", "Wajib", "Format YYYY-MM-DD atau DD-MM-YYYY."],
    ["MK Tercatat (Tahun)", "Opsional", "Angka tahun masa kerja (0 sampai 60, default 0)."],
    ["MK Tercatat (Bulan)", "Opsional", "Angka bulan masa kerja (0 sampai 11, default 0)."],
    ["TMT KGB Terakhir", "Opsional", "Boleh dikosongkan. Format YYYY-MM-DD atau DD-MM-YYYY."],
    ["Unit Kerja", "Opsional", "Nama bidang atau subbagian."],
    [""],
    ["Catatan: Hapus atau timpa baris contoh pada sheet 'Data Pegawai' sebelum mengimpor."],
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjuk);
  wsPetunjuk["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 76 }];
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, "Petunjuk Pengisian");

  XLSX.writeFile(wb, "Template_Import_Pegawai_Disperkimtan.xlsx");
}

export interface PegawaiExportRow {
  nip: string;
  nama: string;
  lahir: string;
  gol: string;
  tmtGol: string;
  jabatan: string;
  eselon: string;
  bup: number;
  cpns: string;
  mkTercatatThn: number;
  mkTercatatBln: number;
  tmtKgbTerakhir: string | null;
  unit: string;
}

export interface PensiunExportRow {
  nama: string;
  nip: string;
  jabatan: string;
  tahunPensiun: number;
  tmtPensiun: string;
  masaKerjaText: string;
}

function todayFileTag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Buat workbook Excel data pegawai (kompatibel dengan template import). */
export function buildPegawaiWorkbook(rows: PegawaiExportRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const dataRows = rows.map((p) => [
    p.nip,
    p.nama,
    p.lahir,
    p.gol,
    p.tmtGol,
    p.jabatan,
    p.eselon,
    p.bup,
    p.cpns,
    p.mkTercatatThn,
    p.mkTercatatBln,
    p.tmtKgbTerakhir ?? "",
    p.unit,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], ...dataRows]);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 15 },
    { wch: 11 },
    { wch: 15 },
    { wch: 34 },
    { wch: 14 },
    { wch: 8 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
  ];
  for (let i = 0; i < rows.length; i++) {
    const cellRef = `A${i + 2}`;
    if (ws[cellRef]) {
      ws[cellRef].t = "s";
      ws[cellRef].z = "@";
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, "Data Pegawai");
  return wb;
}

/** Unduh data pegawai sebagai file Excel (.xlsx). */
export function exportPegawaiExcel(rows: PegawaiExportRow[]): void {
  const wb = buildPegawaiWorkbook(rows);
  XLSX.writeFile(wb, `Data_Pegawai_Disperkimtan_${todayFileTag()}.xlsx`);
}

/** Buat workbook Excel daftar proyeksi pensiun. */
export function buildPensiunWorkbook(rows: PensiunExportRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = [
    "No Urut",
    "Nama",
    "NIP",
    "Jabatan",
    "Tahun Pensiun",
    "TMT Pensiun",
    "Masa Kerja Saat Pensiun",
  ];
  const dataRows = rows.map((r, i) => [
    i + 1,
    r.nama,
    r.nip,
    r.jabatan || "-",
    r.tahunPensiun,
    r.tmtPensiun,
    r.masaKerjaText,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 22 },
    { wch: 34 },
    { wch: 15 },
    { wch: 15 },
    { wch: 24 },
  ];
  for (let i = 0; i < rows.length; i++) {
    const cellRef = `C${i + 2}`;
    if (ws[cellRef]) {
      ws[cellRef].t = "s";
      ws[cellRef].z = "@";
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Pensiun");
  return wb;
}

/** Unduh daftar proyeksi pensiun sebagai file Excel (.xlsx). */
export function exportPensiunExcel(rows: PensiunExportRow[]): void {
  const wb = buildPensiunWorkbook(rows);
  XLSX.writeFile(wb, `Daftar_Pensiun_Disperkimtan_${todayFileTag()}.xlsx`);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const iso = `${val.getFullYear()}-${pad2(val.getMonth() + 1)}-${pad2(val.getDate())}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  if (typeof val === "number" && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const iso = `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
      return isValidIsoDate(iso) ? iso : null;
    }
    return null;
  }

  const s = String(val).trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const iso = `${ymd[1]}-${pad2(Number(ymd[2]))}-${pad2(Number(ymd[3]))}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  return null;
}

function cleanStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function cleanNip(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return String(Math.trunc(val));
  return String(val).trim().replace(/^'+/, "");
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Baca dan validasi file Excel (.xlsx / .xls) yang memakai template pegawai. */
export function parseExcelPegawai(buffer: ArrayBuffer): ExcelParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === "data pegawai") ?? wb.SheetNames[0];

  if (!sheetName) {
    return { valid: [], errors: [{ row: 1, message: "File Excel tidak memiliki sheet data." }], totalRows: 0 };
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return { valid: [], errors: [{ row: 1, message: "Sheet data tidak dapat dibaca." }], totalRows: 0 };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) {
    return {
      valid: [],
      errors: [{ row: 1, message: "File Excel kosong atau belum ada baris data di bawah header." }],
      totalRows: 0,
    };
  }

  const headerRow = rows[0] ?? [];
  const colIndex = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = normalizeHeader(cell);
    if (key) colIndex.set(key, idx);
  });

  const findCol = (...aliases: string[]): number => {
    for (const a of aliases) {
      const idx = colIndex.get(a);
      if (idx !== undefined) return idx;
    }
    return -1;
  };

  const idxNip = findCol("nip");
  const idxNama = findCol("nama lengkap", "nama");
  const idxLahir = findCol("tanggal lahir", "tgl lahir", "lahir");
  const idxGol = findCol("golongan", "gol");
  const idxTmtGol = findCol("tmt golongan", "tmt gol");
  const idxJabatan = findCol("jabatan");
  const idxEselon = findCol("eselon");
  const idxBup = findCol("bup", "batas usia pensiun");
  const idxCpns = findCol("tmt cpns", "cpns");
  const idxMkT = findCol("mk tercatat (tahun)", "masa kerja tercatat (tahun)", "mk tahun");
  const idxMkB = findCol("mk tercatat (bulan)", "masa kerja tercatat (bulan)", "mk bulan");
  const idxKgb = findCol("tmt kgb terakhir", "kgb terakhir");
  const idxUnit = findCol("unit kerja", "unit");

  if (idxNip < 0 || idxNama < 0 || idxLahir < 0 || idxGol < 0 || idxTmtGol < 0 || idxCpns < 0) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          message:
            "Header kolom tidak sesuai template. Gunakan tombol Unduh Template Excel terlebih dahulu.",
        },
      ],
      totalRows: 0,
    };
  }

  const valid: PegawaiImportRecord[] = [];
  const errors: ExcelParseError[] = [];
  let totalRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const hasAnyValue = r.some((cell) => cleanStr(cell) !== "");
    if (!hasAnyValue) continue;

    const excelRow = i + 1;
    totalRows += 1;

    const nip = cleanNip(r[idxNip]);
    const nama = cleanStr(r[idxNama]);
    const lahir = parseExcelDate(r[idxLahir]);
    const gol = cleanStr(r[idxGol]);
    const tmtGol = parseExcelDate(r[idxTmtGol]);
    const jabatan = idxJabatan >= 0 ? cleanStr(r[idxJabatan]) : "";
    const eselon = idxEselon >= 0 ? cleanStr(r[idxEselon]) : "";
    const bupRaw = idxBup >= 0 ? cleanStr(r[idxBup]) : "";
    const bup = bupRaw === "" ? 58 : Number(bupRaw);
    const cpns = parseExcelDate(r[idxCpns]);
    const mkTRaw = idxMkT >= 0 ? cleanStr(r[idxMkT]) : "";
    const mkT = mkTRaw === "" ? 0 : Number(mkTRaw);
    const mkBRaw = idxMkB >= 0 ? cleanStr(r[idxMkB]) : "";
    const mkB = mkBRaw === "" ? 0 : Number(mkBRaw);
    const kgbRaw = idxKgb >= 0 ? r[idxKgb] : "";
    const kgb = cleanStr(kgbRaw) === "" ? null : parseExcelDate(kgbRaw);
    const unit = idxUnit >= 0 ? cleanStr(r[idxUnit]) : "";

    const rowErrors: string[] = [];
    if (!nip || nip.length > 30) rowErrors.push("NIP wajib diisi (maks 30 karakter)");
    if (!nama || nama.length > 200) rowErrors.push("Nama Lengkap wajib diisi");
    if (!lahir) rowErrors.push("Tanggal Lahir tidak valid (gunakan YYYY-MM-DD atau DD-MM-YYYY)");
    if (!gol || gol.length > 10) rowErrors.push("Golongan wajib diisi");
    if (!tmtGol) rowErrors.push("TMT Golongan tidak valid");
    if (!cpns) rowErrors.push("TMT CPNS tidak valid");
    if (!Number.isInteger(bup) || bup < 50 || bup > 70) rowErrors.push("BUP harus angka 50-70");
    if (!Number.isInteger(mkT) || mkT < 0 || mkT > 60) rowErrors.push("MK Tercatat (Tahun) harus 0-60");
    if (!Number.isInteger(mkB) || mkB < 0 || mkB > 11) rowErrors.push("MK Tercatat (Bulan) harus 0-11");
    if (cleanStr(kgbRaw) !== "" && !kgb) rowErrors.push("TMT KGB Terakhir tidak valid");

    if (rowErrors.length > 0) {
      errors.push({ row: excelRow, message: rowErrors.join("; ") });
      continue;
    }

    valid.push({
      nip,
      nama,
      lahir: lahir!,
      gol,
      tmtGol: tmtGol!,
      jabatan,
      eselon,
      bup,
      cpns: cpns!,
      mkTercatatThn: mkT,
      mkTercatatBln: mkB,
      mengabdiThn: 0,
      mengabdiBln: 0,
      tmtKgbTerakhir: kgb,
      unit,
      perluVerifikasi: false,
    });
  }

  return { valid, errors, totalRows };
}
