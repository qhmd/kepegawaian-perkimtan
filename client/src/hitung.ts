// Mesin hitung pensiun & gaji berkala (KGB).
// Semua fungsi murni: masukan baris pegawai + tanggal pengaturan,
// keluaran nilai terhitung. Aturan sesuai halaman Catatan di aplikasi.

export interface PegawaiHitung {
  lahir: string; // YYYY-MM-DD
  gol: string;
  bup: number;
  cpns: string; // YYYY-MM-DD
  mkTercatatThn: number;
  mkTercatatBln: number;
  mengabdiThn: number;
  mengabdiBln: number;
  tmtKgbTerakhir: string | null;
}

export interface HasilPensiun {
  tahunPensiun: number;
  tmtPensiun: string; // YYYY-MM-DD
  masaKerjaThn: number;
  masaKerjaBln: number;
}

export type StatusBerkala = "berkala" | "mentok" | "pensiun";

export interface HasilBerkala {
  mkgSaatIniThn: number;
  mkgSaatIniBln: number;
  mkgBerikutnya: number; // tahun penuh target
  tmtKgbBerikutnya: string | null; // null bila tidak ada (mentok)
  status: StatusBerkala;
  statusLabel: string;
}

// ---------- util tanggal (semua berbasis bulan penuh) ----------

export function ym(iso: string): { y: number; m: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) };
}

/** Jumlah bulan penuh dari tanggal a ke tanggal b (b - a), berbasis tahun-bulan. */
export function bulanAntara(aIso: string, bIso: string): number {
  const a = ym(aIso);
  const b = ym(bIso);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

export function isoDariYM(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Geser tanggal ISO sejumlah bulan, hasilnya selalu tanggal 1. */
export function geserBulan(iso: string, n: number): string {
  const { y, m } = ym(iso);
  const total = y * 12 + (m - 1) + n;
  return isoDariYM(Math.floor(total / 12), (total % 12) + 1);
}

/** Format YYYY-MM-DD -> DD-MM-YYYY */
export function fmtTgl(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y = "", m = "", d = ""] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function fmtMK(thn: number, bln: number): string {
  return `${thn} thn ${bln} bln`;
}

// ---------- pensiun ----------

export function hitungPensiun(p: PegawaiHitung): HasilPensiun {
  const lahir = ym(p.lahir);
  // Genap BUP pada bulan lahir tahun (lahir + BUP); TMT = tanggal 1 bulan berikutnya.
  const tmt = geserBulan(isoDariYM(lahir.y + p.bup, lahir.m), 1);
  const kerjaBln = Math.max(0, bulanAntara(p.cpns, tmt));
  return {
    tahunPensiun: Number(tmt.slice(0, 4)),
    tmtPensiun: tmt,
    masaKerjaThn: Math.floor(kerjaBln / 12),
    masaKerjaBln: kerjaBln % 12,
  };
}

// ---------- berkala ----------

/** Golongan romawi dari kode golongan, mis. "III/d" -> "III". */
export function golRomawi(gol: string): string {
  return gol.split("/")[0]?.trim().toUpperCase() ?? "";
}

export const MKG_MAKS: Record<string, number> = {
  I: 27,
  II: 33,
  III: 32,
  IV: 32,
};

export function hitungBerkala(
  p: PegawaiHitung,
  tanggalData: string,
  tanggalAcuan: string,
  tmtPensiun: string,
): HasilBerkala {
  const romawi = golRomawi(p.gol);
  const maks = MKG_MAKS[romawi] ?? 32;
  const ganjil = romawi === "I" || romawi === "II"; // Gol I & II: MKG ganjil; III & IV: genap

  const berlalu = Math.max(0, bulanAntara(tanggalData, tanggalAcuan));
  // MKG = Masa Kerja Tercatat + bulan berlalu sejak Tanggal Data.
  // Masa Kerja Tercatat sudah mencakup Masa Mengabdi, jadi Masa Mengabdi
  // TIDAK ditambahkan lagi di sini (berbeda dengan rumus pensiun).
  const mkgBln = p.mkTercatatThn * 12 + p.mkTercatatBln + berlalu;
  const mkgThn = Math.floor(mkgBln / 12);
  const mkgSisaBln = mkgBln % 12;

  // MKG berikutnya: tahun penuh terkecil di atas MKG saat ini yang cocok pola.
  let target = mkgThn + 1;
  const cocok = (t: number) => (ganjil ? t % 2 === 1 : t % 2 === 0);
  while (!cocok(target)) target += 1;

  const dasar = {
    mkgSaatIniThn: mkgThn,
    mkgSaatIniBln: mkgSisaBln,
    mkgBerikutnya: target,
  };

  if (target > maks) {
    return {
      ...dasar,
      tmtKgbBerikutnya: null,
      status: "mentok",
      statusLabel: "Mentok MKG",
    };
  }

  let tmtKgb: string;
  if (p.tmtKgbTerakhir) {
    tmtKgb = geserBulan(p.tmtKgbTerakhir, 24);
  } else {
    const kurangBln = target * 12 - mkgBln;
    tmtKgb = geserBulan(tanggalAcuan, kurangBln);
  }

  if (tmtPensiun < tmtKgb) {
    return {
      ...dasar,
      tmtKgbBerikutnya: tmtKgb,
      status: "pensiun",
      statusLabel: "Pensiun lebih dulu",
    };
  }

  return {
    ...dasar,
    tmtKgbBerikutnya: tmtKgb,
    status: "berkala",
    statusLabel: "Berkala",
  };
}
