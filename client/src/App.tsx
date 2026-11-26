import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setFailureNoticeText } from "@hatch/space-sdk/client";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api, type ApiRequest, type ApiResponse } from "./api";
import { AuthScreen, type AuthStatus } from "./AuthScreen";
import {
  exportPegawaiExcel,
  exportPensiunExcel,
  parseExcelPegawai,
  unduhTemplateExcel,
  type ExcelParseResult,
} from "./excelPegawai";
import {
  TAB_PATHS,
  authModeFromPath,
  navigate,
  tabFromPath,
  usePathname,
  type Tab,
} from "./router";
import {
bulanAntara,
fmtMK,
fmtTgl,
geserBulan,
hitungBerkala,
hitungPensiun,
type HasilBerkala,
type HasilPensiun,
} from "./hitung";

setFailureNoticeText((_error, message) => `Gagal memproses: ${message}`);

const FIELDS = actionFields<typeof Actions>();

type Pegawai = ApiResponse<typeof api, "getState">["pegawai"][number];
type PegawaiPayload = ApiRequest<typeof api, "addPegawai">;

// ---------- tanggal & jam real-time (hari ini, tanpa atur manual) ----------

function hariIniIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHariPanjang(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Hari ini yang hidup: berganti sendiri saat tengah malam tanpa muat ulang. */
function useHariIni(): string {
  const [hari, setHari] = useState<string>(() => hariIniIso());
  useEffect(() => {
    const id = window.setInterval(() => {
      const sekarang = hariIniIso();
      setHari((prev) => (prev === sekarang ? prev : sekarang));
    }, 20000);
    return () => window.clearInterval(id);
  }, []);
  return hari;
}

/** Jam berjalan detik demi detik, zona waktu perangkat pengguna. */
function useJamSekarang(): string {
  const [jam, setJam] = useState<string>(() =>
    new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setJam(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return jam;
}

function LencanaLive({ hariIni }: { hariIni: string }) {
  const jam = useJamSekarang();
  return (
    <div
      className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 sm:flex"
      aria-label={`Tanggal hari ini ${formatHariPanjang(hariIni)}, pukul ${jam}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
      <span className="whitespace-nowrap text-xs font-semibold text-[var(--text)]">
        {formatHariPanjang(hariIni)}
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-[var(--dim)]">{jam}</span>
    </div>
  );
}

interface PegawaiTerhitung extends Pegawai {
  pensiun: HasilPensiun;
  berkala: HasilBerkala;
}

// ---------- komponen kecil ----------

type SortDir = "asc" | "desc";

function ThSort<K extends string>({
  kolom,
  aktif,
  arah,
  onSort,
  className = "",
  children,
}: {
  kolom: K;
  aktif: K;
  arah: SortDir;
  onSort: (k: K) => void;
  className?: string;
  children: string;
}) {
  const isAktif = aktif === kolom;
  const ariaSort = isAktif ? (arah === "asc" ? "ascending" : "descending") : "none";
  const ikon = isAktif ? (arah === "asc" ? "▲" : "▼") : "⇅";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button type="button" className="sort-btn" onClick={() => onSort(kolom)}>
        <span>{children}</span>
        <span
          aria-hidden="true"
          className={isAktif ? "text-[10px] text-[var(--accent)]" : "text-[11px] opacity-40"}
        >
          {ikon}
        </span>
      </button>
    </th>
  );
}

function bandingNilai(a: string | number, b: string | number, arah: SortDir): number {
  let cmp = 0;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });
  }
  return arah === "asc" ? cmp : -cmp;
}

function Lencana({ jenis }: { jenis: "berkala" | "mentok" | "pensiun" | "verifikasi" }) {
  const gaya =
    jenis === "berkala"
      ? { bg: "var(--ok-bg)", fg: "var(--ok)", teks: "Berkala" }
      : jenis === "mentok"
        ? { bg: "var(--bad-bg)", fg: "var(--bad)", teks: "Mentok MKG" }
        : jenis === "pensiun"
          ? { bg: "var(--bad-bg)", fg: "var(--bad)", teks: "Pensiun lebih dulu" }
          : { bg: "var(--warn-bg)", fg: "var(--warn)", teks: "Perlu verifikasi" };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: gaya.bg, color: gaya.fg }}
    >
      {gaya.teks}
    </span>
  );
}

function JudulHalaman({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-[26px] font-extrabold uppercase leading-tight tracking-tight text-[#141a21]">{judul}</h2>
      {sub ? <p className="mt-1.5 max-w-3xl text-sm text-[var(--dim)]">{sub}</p> : null}
    </div>
  );
}

// Kartu konten putih dengan pita label biru kecil di sudut atas (opsional)
function Kartu({
  pita,
  children,
  className = "",
}: {
  pita?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${pita ? "mt-7" : ""} ${className}`}>
      {pita ? <span className="pita">{pita}</span> : null}
      <div className="kartu">{children}</div>
    </div>
  );
}

// Ikon garis sederhana untuk menu & topbar
function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const IKON_MENU: Record<Tab, ReactNode> = {
  dashboard: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  pegawai: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  pensiun: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </>
  ),
  berkala: (
    <>
      <path d="M22 7l-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  pengaturan: (
    <>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </>
  ),
  catatan: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
};

function SelKosong({ pesan }: { pesan: string }) {
  return <p className="py-8 text-center text-sm text-[var(--dim)]">{pesan}</p>;
}

// ---------- formulir pegawai ----------

interface FormState {
  nip: string;
  nama: string;
  lahir: string;
  gol: string;
  tmtGol: string;
  jabatan: string;
  eselon: string;
  bup: string;
  cpns: string;
  mkT: string;
  mkB: string;
  tmtKgbTerakhir: string;
  unit: string;
  perluVerifikasi: boolean;
}

function formAwal(p: Pegawai | null): FormState {
  if (!p) {
    return {
      nip: "", nama: "", lahir: "", gol: "", tmtGol: "", jabatan: "",
      eselon: "", bup: "58", cpns: "", mkT: "0", mkB: "0",
      tmtKgbTerakhir: "", unit: "", perluVerifikasi: false,
    };
  }
  return {
    nip: p.nip, nama: p.nama, lahir: p.lahir, gol: p.gol, tmtGol: p.tmtGol,
    jabatan: p.jabatan, eselon: p.eselon, bup: String(p.bup), cpns: p.cpns,
    mkT: String(p.mkTercatatThn), mkB: String(p.mkTercatatBln),
    tmtKgbTerakhir: p.tmtKgbTerakhir ?? "", unit: p.unit,
    perluVerifikasi: p.perluVerifikasi,
  };
}

function LabelTeks({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-[var(--text)]">
      {children}
    </label>
  );
}

const kelasInput =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";

function PegawaiForm({
  awal,
  judul,
  onSimpan,
  onBatal,
  sibuk,
  galat,
}: {
  awal: Pegawai | null;
  judul: string;
  onSimpan: (payload: PegawaiPayload) => void;
  onBatal: () => void;
  sibuk: boolean;
  galat: string | null;
}) {
  const [f, setF] = useState<FormState>(() => formAwal(awal));
  const [pesan, setPesan] = useState<string | null>(null);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  function kirim(e: FormEvent) {
    e.preventDefault();
    if (!f.nip.trim()) { setPesan("NIP wajib diisi."); return; }
    if (!f.nama.trim()) { setPesan("Nama wajib diisi."); return; }
    if (!f.lahir) { setPesan("Tanggal lahir wajib diisi."); return; }
    if (!f.gol.trim()) { setPesan("Golongan wajib diisi."); return; }
    if (!f.tmtGol) { setPesan("TMT Golongan wajib diisi."); return; }
    if (!f.cpns) { setPesan("TMT CPNS wajib diisi."); return; }
    setPesan(null);
    onSimpan({
      nip: f.nip.trim(),
      nama: f.nama.trim(),
      lahir: f.lahir,
      gol: f.gol.trim(),
      tmtGol: f.tmtGol,
      jabatan: f.jabatan.trim(),
      eselon: f.eselon.trim(),
      bup: Number(f.bup) || 58,
      cpns: f.cpns,
      mkTercatatThn: Number(f.mkT) || 0,
      mkTercatatBln: Number(f.mkB) || 0,
      mengabdiThn: 0,
      mengabdiBln: 0,
      tmtKgbTerakhir: f.tmtKgbTerakhir ? f.tmtKgbTerakhir : null,
      unit: f.unit.trim(),
      perluVerifikasi: f.perluVerifikasi,
    });
  }

  return (
    <form
      onSubmit={kirim}
      className="anim-panel mb-6 kartu p-4"
    >
      <h3 className="font-display mb-3 text-lg font-bold text-[var(--text)]">{judul}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <LabelTeks htmlFor="f-nip">NIP</LabelTeks>
          <input {...FIELDS.addPegawai.nip} id="f-nip" aria-label="NIP" className={kelasInput} value={f.nip} onChange={set("nip")} />
        </div>
        <div className="sm:col-span-2">
          <LabelTeks htmlFor="f-nama">Nama Lengkap</LabelTeks>
          <input {...FIELDS.addPegawai.nama} id="f-nama" aria-label="Nama Lengkap" className={kelasInput} value={f.nama} onChange={set("nama")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-lahir">Tanggal Lahir</LabelTeks>
          <input {...FIELDS.addPegawai.lahir} id="f-lahir" aria-label="Tanggal Lahir" type="date" className={kelasInput} value={f.lahir} onChange={set("lahir")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-gol">Golongan (mis. III/d)</LabelTeks>
          <input {...FIELDS.addPegawai.gol} id="f-gol" aria-label="Golongan" className={kelasInput} value={f.gol} onChange={set("gol")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-tmtgol">TMT Golongan</LabelTeks>
          <input {...FIELDS.addPegawai.tmtGol} id="f-tmtgol" aria-label="TMT Golongan" type="date" className={kelasInput} value={f.tmtGol} onChange={set("tmtGol")} />
        </div>
        <div className="sm:col-span-2">
          <LabelTeks htmlFor="f-jabatan">Jabatan</LabelTeks>
          <input {...FIELDS.addPegawai.jabatan} id="f-jabatan" aria-label="Jabatan" className={kelasInput} value={f.jabatan} onChange={set("jabatan")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-eselon">Eselon</LabelTeks>
          <input {...FIELDS.addPegawai.eselon} id="f-eselon" aria-label="Eselon" className={kelasInput} value={f.eselon} onChange={set("eselon")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-bup">Batas Usia Pensiun (tahun)</LabelTeks>
          <input {...FIELDS.addPegawai.bup} id="f-bup" aria-label="Batas Usia Pensiun (tahun)" type="number" className={kelasInput} value={f.bup} onChange={set("bup")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-cpns">TMT CPNS</LabelTeks>
          <input {...FIELDS.addPegawai.cpns} id="f-cpns" aria-label="TMT CPNS" type="date" className={kelasInput} value={f.cpns} onChange={set("cpns")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-kgbterakhir">TMT KGB Terakhir (boleh kosong)</LabelTeks>
          <input id="f-kgbterakhir" aria-label="TMT KGB Terakhir" type="date" className={kelasInput} value={f.tmtKgbTerakhir} onChange={set("tmtKgbTerakhir")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-mkt">Masa Kerja Tercatat (Tahun)</LabelTeks>
          <input {...FIELDS.addPegawai.mkTercatatThn} id="f-mkt" aria-label="Masa Kerja Tercatat Tahun" type="number" className={kelasInput} value={f.mkT} onChange={set("mkT")} />
        </div>
        <div>
          <LabelTeks htmlFor="f-mkb">Masa Kerja Tercatat (Bulan)</LabelTeks>
          <input {...FIELDS.addPegawai.mkTercatatBln} id="f-mkb" aria-label="Masa Kerja Tercatat Bulan" type="number" className={kelasInput} value={f.mkB} onChange={set("mkB")} />
        </div>
        <div className="sm:col-span-2">
          <LabelTeks htmlFor="f-unit">Unit Kerja</LabelTeks>
          <input {...FIELDS.addPegawai.unit} id="f-unit" aria-label="Unit Kerja" className={kelasInput} value={f.unit} onChange={set("unit")} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={f.perluVerifikasi}
              onChange={(e) => setF((prev) => ({ ...prev, perluVerifikasi: e.target.checked }))}
            />
            Tandai perlu verifikasi
          </label>
        </div>
      </div>
      {pesan ? <p className="mt-3 text-sm font-medium" style={{ color: "var(--bad)" }}>{pesan}</p> : null}
      {galat ? <p className="mt-3 text-sm font-medium" style={{ color: "var(--bad)" }}>{galat}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={sibuk}
          className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={onBatal}
          className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          Batal
        </button>
      </div>
    </form>
  );
}

// ---------- Dashboard ----------

function Dashboard({ data, tanggalAcuan }: { data: PegawaiTerhitung[]; tanggalAcuan: string }) {
  type DashSortKey = "nama" | "jabatan" | "tmtPensiun" | "sisaWaktu";
  const [sortKey, setSortKey] = useState<DashSortKey>("tmtPensiun");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(k: DashSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const batasPensiun = geserBulan(tanggalAcuan, 12);
  const pensiunDekat = useMemo(() => {
    const filtered = data.filter(
      (p) => p.pensiun.tmtPensiun >= tanggalAcuan && p.pensiun.tmtPensiun <= batasPensiun,
    );
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "nama": return bandingNilai(a.nama, b.nama, sortDir);
        case "jabatan": return bandingNilai(a.jabatan, b.jabatan, sortDir);
        case "sisaWaktu":
          return bandingNilai(
            bulanAntara(tanggalAcuan, a.pensiun.tmtPensiun),
            bulanAntara(tanggalAcuan, b.pensiun.tmtPensiun),
            sortDir,
          );
        case "tmtPensiun":
        default:
          return bandingNilai(a.pensiun.tmtPensiun, b.pensiun.tmtPensiun, sortDir);
      }
    });
  }, [data, tanggalAcuan, batasPensiun, sortKey, sortDir]);

  const statistik: { label: string; nilai: string; sub?: string }[] = [
    { label: "Jumlah Pegawai", nilai: String(data.length) },
    { label: "Pensiun 12 Bulan ke Depan", nilai: String(pensiunDekat.length) },
  ];

  return (
    <div>
      <JudulHalaman
        judul="Ringkasan Kepegawaian"
        sub={`Per ${formatHariPanjang(tanggalAcuan)} (${fmtTgl(tanggalAcuan)}).`}
      />

      <Kartu pita="Ringkasan">
        <div className="grid grid-cols-2">
          {statistik.map((st, i) => (
            <div
              key={st.label}
              className={`px-5 py-4 ${i > 0 ? "border-l border-[var(--border)]" : ""} ${i >= 2 ? "max-lg:border-t max-lg:border-[var(--border)]" : ""} ${i === 2 ? "max-lg:border-l-0" : ""}`}
            >
              <p className="text-sm text-[var(--dim)]">{st.label}</p>
              <p className="font-display mt-1 text-[34px] font-bold leading-none text-[var(--text)]">{st.nilai}</p>
              {st.sub ? <p className="mt-1.5 text-xs font-medium" style={{ color: "var(--warn)" }}>{st.sub}</p> : null}
            </div>
          ))}
        </div>
      </Kartu>

      <Kartu pita="Pensiun 12 Bulan ke Depan" className="mt-10">
        <div className="overflow-x-auto">
          {pensiunDekat.length === 0 ? (
            <SelKosong pesan="Tidak ada pegawai yang pensiun dalam 12 bulan ke depan." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <ThSort kolom="nama" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Nama</ThSort>
                  <ThSort kolom="jabatan" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Jabatan</ThSort>
                  <ThSort kolom="tmtPensiun" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="date">TMT Pensiun</ThSort>
                  <ThSort kolom="sisaWaktu" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">Sisa Waktu</ThSort>
                </tr>
              </thead>
              <tbody>
                {pensiunDekat.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.nama}</td>
                    <td className="text-[var(--dim)]">{p.jabatan || "-"}</td>
                    <td className="date">{fmtTgl(p.pensiun.tmtPensiun)}</td>
                    <td className="num">{bulanAntara(tanggalAcuan, p.pensiun.tmtPensiun)} bln lagi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Kartu>

    </div>
  );
}

// ---------- Data Pegawai ----------

function HalamanPegawai({ data }: { data: Pegawai[] }) {
  type PegawaiSortKey =
    | "no"
    | "nama"
    | "nip"
    | "jabatan"
    | "lahir"
    | "gol"
    | "cpns"
    | "mk"
    | "status";

  const queryClient = useQueryClient();
  const [cari, setCari] = useState("");
  const [mode, setMode] = useState<"daftar" | "tambah" | "ubah">("daftar");
  const [terpilih, setTerpilih] = useState<Pegawai | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<Pegawai | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<PegawaiSortKey>("nama");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasilImport, setHasilImport] = useState<{ namaFile: string; parsed: ExcelParseResult } | null>(null);
  const [importMode, setImportMode] = useState<"skip" | "update">("skip");
  const [infoImport, setInfoImport] = useState<string | null>(null);
  const [galatImport, setGalatImport] = useState<string | null>(null);

  const segarkan = () => queryClient.invalidateQueries({ queryKey: ["state"] });

  function toggleSort(k: PegawaiSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const tambah = useMutation({
    mutationFn: async (payload: PegawaiPayload) => await api.addPegawai(payload),
    onSuccess: () => { segarkan(); setMode("daftar"); setGalatForm(null); },
    onError: (e) => setGalatForm(e instanceof Error ? e.message : "Gagal menyimpan pegawai."),
  });
  const ubah = useMutation({
    mutationFn: async (args: { id: number; payload: PegawaiPayload }) =>
      await api.updatePegawai({ ...args.payload, id: args.id }),
    onSuccess: () => { segarkan(); setMode("daftar"); setTerpilih(null); setGalatForm(null); },
    onError: (e) => setGalatForm(e instanceof Error ? e.message : "Gagal menyimpan perubahan."),
  });
  const hapus = useMutation({
    mutationFn: async (id: number) => await api.deletePegawai({ id }),
    onSuccess: () => { segarkan(); setKonfirmasiHapus(null); },
    onError: (e) => setGalatForm(e instanceof Error ? e.message : "Gagal menghapus pegawai."),
  });
  const impor = useMutation({
    mutationFn: async () => {
      if (!hasilImport || hasilImport.parsed.valid.length === 0) {
        throw new Error("Tidak ada baris valid untuk diimpor.");
      }
      return await api.importPegawai({
        mode: importMode,
        records: hasilImport.parsed.valid,
      });
    },
    onSuccess: (res) => {
      segarkan();
      setHasilImport(null);
      setGalatImport(null);
      setInfoImport(
        `Import selesai: ${res.inserted} ditambahkan, ${res.updated} diperbarui, ${res.skipped} dilewati.`,
      );
    },
    onError: (e) => setGalatImport(e instanceof Error ? e.message : "Gagal mengimpor file Excel."),
  });

  async function handlePilihFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setInfoImport(null);
    setGalatImport(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseExcelPegawai(buf);
      setHasilImport({ namaFile: file.name, parsed });
    } catch {
      setGalatImport("File tidak dapat dibaca. Pastikan formatnya .xlsx atau .xls yang valid.");
    }
  }

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const list = data.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) ||
        p.nip.toLowerCase().includes(q) ||
        p.jabatan.toLowerCase().includes(q),
    );
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "no": return bandingNilai(a.id, b.id, sortDir);
        case "nip": return bandingNilai(a.nip, b.nip, sortDir);
        case "jabatan": return bandingNilai(a.jabatan, b.jabatan, sortDir);
        case "lahir": return bandingNilai(a.lahir, b.lahir, sortDir);
        case "gol": return bandingNilai(a.gol, b.gol, sortDir);
        case "cpns": return bandingNilai(a.cpns, b.cpns, sortDir);
        case "mk":
          return bandingNilai(
            a.mkTercatatThn * 12 + a.mkTercatatBln,
            b.mkTercatatThn * 12 + b.mkTercatatBln,
            sortDir,
          );
        case "status":
          return bandingNilai(a.perluVerifikasi ? 1 : 0, b.perluVerifikasi ? 1 : 0, sortDir);
        case "nama":
        default:
          return bandingNilai(a.nama, b.nama, sortDir);
      }
    });
  }, [data, cari, sortKey, sortDir]);

  return (
    <div>
      <JudulHalaman
        judul="Data Pegawai"
        sub="Kelola data induk pegawai. Klik judul kolom untuk mengurutkan."
      />

      {mode !== "daftar" ? (
        <PegawaiForm
          awal={mode === "ubah" ? terpilih : null}
          judul={mode === "ubah" ? `Ubah Data: ${terpilih?.nama ?? ""}` : "Tambah Pegawai Baru"}
          sibuk={tambah.isPending || ubah.isPending}
          galat={galatForm}
          onBatal={() => { setMode("daftar"); setTerpilih(null); setGalatForm(null); }}
          onSimpan={(payload) => {
            if (mode === "ubah" && terpilih) ubah.mutate({ id: terpilih.id, payload });
            else tambah.mutate(payload);
          }}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Cari nama, NIP, atau jabatan"
          placeholder="Cari nama, NIP, atau jabatan…"
          className="min-w-56 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          aria-label="Pilih file Excel pegawai"
          className="hidden"
          onChange={handlePilihFile}
        />
        <button
          type="button"
          onClick={() => unduhTemplateExcel()}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)]"
        >
          Unduh Template Excel
        </button>
        <button
          type="button"
          disabled={tersaring.length === 0}
          onClick={() => exportPegawaiExcel(tersaring)}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)] disabled:opacity-50"
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface-alt)]"
        >
          Import Excel
        </button>
        <button
          type="button"
          onClick={() => { setMode("tambah"); setGalatForm(null); }}
          className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          + Tambah Pegawai
        </button>
      </div>

      {infoImport ? (
        <div
          role="status"
          className="anim-panel mb-4 flex items-center justify-between gap-2 rounded-[var(--radius)] border px-4 py-2.5 text-sm font-medium"
          style={{ borderColor: "var(--ok)", background: "var(--ok-bg)", color: "var(--ok)" }}
        >
          <span>{infoImport}</span>
          <button
            type="button"
            onClick={() => setInfoImport(null)}
            className="min-h-0 text-xs font-bold underline"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {galatImport ? (
        <div
          role="alert"
          className="anim-panel mb-4 rounded-[var(--radius)] border px-4 py-2.5 text-sm font-medium"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
        >
          {galatImport}
        </div>
      ) : null}

      {hasilImport ? (
        <div className="anim-panel mb-5 kartu p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text)]">
                Pratinjau Import: {hasilImport.namaFile}
              </h3>
              <p className="mt-0.5 text-sm text-[var(--dim)]">
                Terbaca {hasilImport.parsed.totalRows} baris: {hasilImport.parsed.valid.length} valid,{" "}
                {hasilImport.parsed.errors.length} bermasalah.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setHasilImport(null); setGalatImport(null); }}
              className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]"
            >
              Batal
            </button>
          </div>

          {hasilImport.parsed.errors.length > 0 ? (
            <div
              className="mt-3 max-h-40 overflow-y-auto rounded-[var(--radius)] border p-3 text-xs"
              style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
            >
              <p className="mb-1 font-bold">Baris yang gagal divalidasi (tidak akan diimpor):</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {hasilImport.parsed.errors.map((err, idx) => (
                  <li key={idx}>
                    Baris {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasilImport.parsed.valid.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <span>Jika NIP sudah ada:</span>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as "skip" | "update")}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
                >
                  <option value="skip">Lewati data lama</option>
                  <option value="update">Perbarui dengan data Excel</option>
                </select>
              </label>
              <button
                type="button"
                disabled={impor.isPending}
                onClick={() => impor.mutate()}
                className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                {impor.isPending
                  ? "Mengimpor…"
                  : `Import ${hasilImport.parsed.valid.length} Pegawai`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {konfirmasiHapus ? (
        <div
          className="anim-panel mb-4 rounded-[var(--radius)] border p-4"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg)" }}
          role="alertdialog"
          aria-label="Konfirmasi hapus pegawai"
        >
          <p className="text-sm font-medium text-[var(--text)]">
            Hapus data <strong>{konfirmasiHapus.nama}</strong> (NIP {konfirmasiHapus.nip})? Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={hapus.isPending}
              onClick={() => hapus.mutate(konfirmasiHapus.id)}
              className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--bad)" }}
            >
              {hapus.isPending ? "Menghapus…" : "Ya, Hapus"}
            </button>
            <button
              type="button"
              onClick={() => setKonfirmasiHapus(null)}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}

      <p className="mb-2 text-sm text-[var(--dim)]">
        Menampilkan {tersaring.length} dari {data.length} pegawai.
      </p>
      <div className="overflow-x-auto kartu">
        {tersaring.length === 0 ? (
          <SelKosong pesan="Tidak ada pegawai yang cocok dengan pencarian." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <ThSort kolom="no" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">No</ThSort>
                <ThSort kolom="nama" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Nama</ThSort>
                <ThSort kolom="nip" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="center">NIP</ThSort>
                <ThSort kolom="jabatan" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Jabatan</ThSort>
                <ThSort kolom="lahir" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="date">Tgl Lahir</ThSort>
                <ThSort kolom="gol" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="center">Gol</ThSort>
                <ThSort kolom="cpns" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="date">TMT CPNS</ThSort>
                <ThSort kolom="mk" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">MK Tercatat</ThSort>
                <ThSort kolom="status" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="center">Status Data</ThSort>
                <th className="center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tersaring.map((p, i) => (
                <tr key={p.id}>
                  <td className="num">{i + 1}</td>
                  <td className="font-medium">{p.nama}</td>
                  <td className="center whitespace-nowrap">{p.nip}</td>
                  <td className="text-[var(--dim)]">{p.jabatan || "-"}</td>
                  <td className="date">{fmtTgl(p.lahir)}</td>
                  <td className="center whitespace-nowrap">{p.gol}</td>
                  <td className="date">{fmtTgl(p.cpns)}</td>
                  <td className="num">{fmtMK(p.mkTercatatThn, p.mkTercatatBln)}</td>
                  <td className="center">{p.perluVerifikasi ? <Lencana jenis="verifikasi" /> : <span className="text-[var(--dim)]">-</span>}</td>
                  <td className="center whitespace-nowrap">
                    <button
                      type="button"
                      className="mr-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text)]"
                      onClick={() => { setTerpilih(p); setMode("ubah"); setGalatForm(null); }}
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-2.5 py-1 text-xs font-medium"
                      style={{ borderColor: "var(--bad)", color: "var(--bad)" }}
                      onClick={() => setKonfirmasiHapus(p)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------- Pensiun ----------

function HalamanPensiun({ data }: { data: PegawaiTerhitung[] }) {
  type PensiunSortKey =
    | "no"
    | "nama"
    | "nip"
    | "jabatan"
    | "tahunPensiun"
    | "tmtPensiun"
    | "masaKerja";

  const [sortKey, setSortKey] = useState<PensiunSortKey>("tmtPensiun");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(k: PensiunSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const urut = useMemo(() => {
    return [...data].sort((a, b) => {
      switch (sortKey) {
        case "no": return bandingNilai(a.id, b.id, sortDir);
        case "nama": return bandingNilai(a.nama, b.nama, sortDir);
        case "nip": return bandingNilai(a.nip, b.nip, sortDir);
        case "jabatan": return bandingNilai(a.jabatan, b.jabatan, sortDir);
        case "tahunPensiun": return bandingNilai(a.pensiun.tahunPensiun, b.pensiun.tahunPensiun, sortDir);
        case "masaKerja":
          return bandingNilai(
            a.pensiun.masaKerjaThn * 12 + a.pensiun.masaKerjaBln,
            b.pensiun.masaKerjaThn * 12 + b.pensiun.masaKerjaBln,
            sortDir,
          );
        case "tmtPensiun":
        default:
          return bandingNilai(a.pensiun.tmtPensiun, b.pensiun.tmtPensiun, sortDir);
      }
    });
  }, [data, sortKey, sortDir]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            Daftar Pensiun
          </h2>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Klik judul kolom untuk mengurutkan. TMT Pensiun = tanggal 1 bulan berikutnya setelah pegawai genap mencapai Batas Usia Pensiun (BUP).
          </p>
        </div>
        <button
          type="button"
          disabled={urut.length === 0}
          onClick={() =>
            exportPensiunExcel(
              urut.map((p) => ({
                nama: p.nama,
                nip: p.nip,
                jabatan: p.jabatan,
                tahunPensiun: p.pensiun.tahunPensiun,
                tmtPensiun: fmtTgl(p.pensiun.tmtPensiun),
                masaKerjaText: fmtMK(p.pensiun.masaKerjaThn, p.pensiun.masaKerjaBln),
              })),
            )
          }
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)] disabled:opacity-50"
        >
          Export Excel
        </button>
      </div>
      <div className="overflow-x-auto kartu">
        {urut.length === 0 ? (
          <SelKosong pesan="Belum ada data pegawai." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <ThSort kolom="no" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">No Urut</ThSort>
                <ThSort kolom="nama" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Nama</ThSort>
                <ThSort kolom="nip" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="center">NIP</ThSort>
                <ThSort kolom="jabatan" aktif={sortKey} arah={sortDir} onSort={toggleSort}>Jabatan</ThSort>
                <ThSort kolom="tahunPensiun" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">Tahun Pensiun</ThSort>
                <ThSort kolom="tmtPensiun" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="date">TMT Pensiun</ThSort>
                <ThSort kolom="masaKerja" aktif={sortKey} arah={sortDir} onSort={toggleSort} className="num">Masa Kerja Saat Pensiun</ThSort>
              </tr>
            </thead>
            <tbody>
              {urut.map((p, i) => (
                <tr key={p.id}>
                  <td className="num">{i + 1}</td>
                  <td className="font-medium">{p.nama}</td>
                  <td className="center whitespace-nowrap">{p.nip}</td>
                  <td className="text-[var(--dim)]">{p.jabatan || "-"}</td>
                  <td className="num">{p.pensiun.tahunPensiun}</td>
                  <td className="date">{fmtTgl(p.pensiun.tmtPensiun)}</td>
                  <td className="num">{fmtMK(p.pensiun.masaKerjaThn, p.pensiun.masaKerjaBln)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------- Berkala ----------

function HalamanBerkala({ data: _data }: { data: PegawaiTerhitung[] }) {
  void _data;
  return (
    <div>
      <JudulHalaman judul="Jadwal Gaji Berkala (KGB)" sub="Data Berkala belum tersedia." />
      <div className="overflow-x-auto kartu">
        <SelKosong pesan="Data Berkala belum tersedia." />
      </div>
    </div>
  );
}

// ---------- Pengaturan ----------

function HalamanPengaturan({
  tanggalData,
  tanggalAcuan,
}: {
  tanggalData: string;
  tanggalAcuan: string;
}) {
  const queryClient = useQueryClient();
  const [td, setTd] = useState(tanggalData);
  const [pesan, setPesan] = useState<string | null>(null);
  const jam = useJamSekarang();

  const simpan = useMutation({
    mutationFn: async () =>
      await api.updateSettings({ tanggalData: td, tanggalAcuan: hariIniIso() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      setPesan("Tanggal Data berhasil disimpan.");
    },
    onError: (e) =>
      setPesan(e instanceof Error ? e.message : "Gagal menyimpan pengaturan."),
  });

  return (
    <div className="max-w-xl">
      <JudulHalaman
        judul="Pengaturan Tanggal"
        sub="Tanggal Acuan mengikuti tanggal hari ini secara otomatis. Atur Tanggal Data sesuai tanggal berlakunya data sumber."
      />

      <div className="kartu mb-5 p-4" aria-label="Tanggal acuan hari ini">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">
          Tanggal Acuan Hari Ini
        </p>
        <p className="font-display mt-1.5 text-2xl font-extrabold leading-tight text-[var(--text)]">
          {formatHariPanjang(tanggalAcuan)}
        </p>
        <p className="mt-1 text-sm tabular-nums text-[var(--dim)]">
          {fmtTgl(tanggalAcuan)} · Pukul {jam}
        </p>
      </div>

      <form
        className="kartu p-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!td) { setPesan("Tanggal Data wajib diisi."); return; }
          simpan.mutate();
        }}
      >
        <div className="mb-4">
          <LabelTeks htmlFor="set-datadata">Tanggal Data</LabelTeks>
          <input
            id="set-datadata" aria-label="Tanggal Data"
            type="date"
            className={kelasInput}
            value={td}
            onChange={(e) => setTd(e.target.value)}
          />
          <p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
            Tanggal berlakunya angka Masa Kerja Tercatat pada file sumber (bawaan: 03-11-2026).
            Ubah hanya bila Anda mengganti file sumber dengan data bertanggal lain.
          </p>
        </div>
        {pesan ? <p className="mb-3 text-sm font-medium text-[var(--text)]">{pesan}</p> : null}
        <button
          type="submit"
          disabled={simpan.isPending}
          className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          {simpan.isPending ? "Menyimpan..." : "Simpan Tanggal Data"}
        </button>
      </form>
    </div>
  );
}

// ---------- Catatan / Aturan ----------

function HalamanCatatan() {
  const blok = "kartu p-4 mb-5";
  const h = "font-display mb-2 text-base font-bold text-[var(--text)]";
  const li = "ml-5 list-disc text-sm leading-6 text-[var(--text)]";
  return (
    <div className="max-w-3xl">
      <JudulHalaman
        judul="Catatan & Aturan Perhitungan"
        sub="Ringkasan aturan perhitungan masa kerja, pensiun, dan KGB yang digunakan sistem."
      />
      <section className={blok}>
        <h3 className={h}>Cara Pakai</h3>
        <ul>
          <li className={li}>Data pegawai dikelola di halaman <strong>Data Pegawai</strong> (bisa ditambah satu per satu atau diimpor lewat template Excel).</li>
          <li className={li}>Mengubah Masa Kerja Tercatat memperbarui perhitungan proyeksi dan jadwal KGB.</li>
          <li className={li}><strong>Tanggal Acuan</strong> selalu mengikuti tanggal hari ini. Halaman <strong>Pengaturan</strong> hanya menyimpan Tanggal Data (tanggal berlakunya angka masa kerja pada file sumber).</li>
          <li className={li}>Pegawai bertanda <strong>Perlu verifikasi</strong> perlu diperiksa ulang ke berkas fisik.</li>
        </ul>
      </section>
      <section className={blok}>
        <h3 className={h}>Data Induk</h3>
        <ul>
          <li className={li}>Satu pegawai dicatat satu kali berdasarkan NIP. Sistem menolak NIP ganda.</li>
          <li className={li}>TMT CPNS dibaca dari NIP: 8 digit setelah tanggal lahir adalah tahun dan bulan pengangkatan (YYYYMM), terhitung tanggal 1.</li>
          <li className={li}><strong>MKG saat ini</strong> = Masa Kerja Tercatat + bulan berlalu dari Tanggal Data sampai hari ini.</li>
        </ul>
      </section>
      <section className={blok}>
        <h3 className={h}>Pensiun</h3>
        <ul>
          <li className={li}>Batas Usia Pensiun (BUP): <strong>58 tahun</strong> untuk administrator, pengawas, pelaksana, JF Ahli Pertama dan Ahli Muda; <strong>60 tahun</strong> untuk JPT/eselon I-II dan JF Ahli Madya; <strong>65 tahun</strong> untuk JF Ahli Utama.</li>
          <li className={li}><strong>TMT Pensiun</strong> = tanggal 1 bulan berikutnya setelah pegawai genap mencapai BUP.</li>
          <li className={li}><strong>Masa Kerja saat pensiun</strong> = TMT Pensiun - TMT CPNS.</li>
          <li className={li}>Daftar pensiun secara bawaan diurutkan dari TMT Pensiun paling dekat.</li>
        </ul>
      </section>
      <section className={blok}>
        <h3 className={h}>Gaji Berkala (KGB)</h3>
        <ul>
          <li className={li}>KGB naik setiap 2 tahun MKG: Golongan I dan II pada MKG <strong>ganjil</strong>; Golongan III dan IV pada MKG <strong>genap</strong>.</li>
          <li className={li}>MKG maksimum (PP 5/2024): Golongan I = 27 tahun, II = 33 tahun, III = 32 tahun, IV = 32 tahun.</li>
          <li className={li}><strong>MKG Berikutnya</strong> = tahun penuh terkecil di atas MKG saat ini sesuai pola golongannya. <strong>TMT KGB Berikutnya</strong> = tanggal 1 pada bulan tercapainya MKG tersebut.</li>
          <li className={li}>Jika kolom <strong>TMT KGB Terakhir</strong> diisi, TMT KGB Berikutnya = tanggal tersebut + 2 tahun.</li>
          <li className={li}>Status: <strong>Berkala</strong> jika masih memenuhi syarat; <strong>Mentok MKG</strong> jika melewati batas maksimum golongan; <strong>Pensiun lebih dulu</strong> jika TMT Pensiun lebih awal dari TMT KGB berikutnya.</li>
        </ul>
      </section>
      <section className={blok}>
        <h3 className={h}>KP4</h3>
        <ul>
          <li className={li}>KP4 (Surat Keterangan untuk Mendapatkan Pembayaran Tunjangan Keluarga) berlaku untuk CPNS maupun PPPK sebagai berkas pendukung pensiun dan KGB.</li>
        </ul>
      </section>
    </div>
  );
}

// ---------- App ----------

const MENU: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Beranda" },
  { id: "pegawai", label: "Data Pegawai" },
  { id: "pensiun", label: "Pensiun" },
  { id: "berkala", label: "Berkala" },
  { id: "pengaturan", label: "Pengaturan" },
  { id: "catatan", label: "Aturan" },
];

export function App() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const tab: Tab = tabFromPath(pathname) ?? "dashboard";
  const [sidebarTerbuka, setSidebarTerbuka] = useState<boolean>(
    () => typeof window === "undefined" || window.innerWidth >= 1024,
  );
  const [profilTerbuka, setProfilTerbuka] = useState(false);
  const [keluarTerbuka, setKeluarTerbuka] = useState(false);
  const [keluarSibuk, setKeluarSibuk] = useState(false);
  const hariIni = useHariIni();

  const auth = useQuery<AuthStatus>({
    queryKey: ["auth"],
    queryFn: async () => {
      const res = await fetch("/auth/me");
      if (!res.ok) throw new Error("Gagal memeriksa sesi masuk.");
      return (await res.json()) as AuthStatus;
    },
  });

  const user = auth.data?.user ?? null;

  useEffect(() => {
    if (!user) return;
    if (!tabFromPath(pathname)) {
      navigate("/", true);
    }
  }, [user, pathname]);

  const state = useQuery({
    queryKey: ["state"],
    queryFn: () => api.getState({}),
    enabled: Boolean(user),
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!profilTerbuka && !keluarTerbuka) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setProfilTerbuka(false);
        setKeluarTerbuka(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profilTerbuka, keluarTerbuka]);

  const terhitung = useMemo<PegawaiTerhitung[]>(() => {
    if (!state.data) return [];
    const { tanggalData } = state.data.settings;
    return state.data.pegawai.map((p) => {
      const pensiun = hitungPensiun(p);
      const berkala = hitungBerkala(p, tanggalData, hariIni, pensiun.tmtPensiun);
      return { ...p, pensiun, berkala };
    });
  }, [state.data, hariIni]);

  function pindah(t: Tab) {
    navigate(TAB_PATHS[t]);
    setProfilTerbuka(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarTerbuka(false);
    }
  }

  async function handleLogout() {
    setKeluarSibuk(true);
    try {
      await fetch("/auth/logout", { method: "POST" });
      setKeluarTerbuka(false);
      setProfilTerbuka(false);
      queryClient.removeQueries({ queryKey: ["state"] });
      navigate("/masuk", true);
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    } finally {
      setKeluarSibuk(false);
    }
  }

  if (auth.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--dim)]">Memeriksa sesi masuk...</p>
      </div>
    );
  }

  if (auth.error || !auth.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
          Gagal terhubung ke server aplikasi.
        </p>
        <button
          type="button"
          onClick={() => auth.refetch()}
          className="mt-3 rounded-[var(--radius)] px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        status={auth.data}
        onSuccess={() => {
          if (authModeFromPath(pathname)) {
            navigate("/", true);
          }
          queryClient.invalidateQueries({ queryKey: ["auth"] });
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Latar gelap penutup sidebar di layar kecil */}
      {sidebarTerbuka ? (
        <button
          type="button"
          aria-label="Tutup menu samping"
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
          onClick={() => setSidebarTerbuka(false)}
        />
      ) : null}

      {/* Sidebar navy gelap */}
      <aside
        className={`${sidebarTerbuka ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-[262px] shrink-0 flex-col lg:sticky lg:top-0 lg:h-screen`}
        style={{ background: "linear-gradient(180deg, #22385a 0%, var(--sidebar) 55%)" }}
        aria-label="Menu samping"
      >
        <div className="px-5 pb-2 pt-6">
          <p className="font-display text-[19px] font-extrabold leading-snug text-white">
            Sistem Kepegawaian
          </p>
          <p className="font-display text-[15px] font-bold uppercase tracking-wide text-[#9fc1e8]">
            Disperkimtan
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "var(--sidebar-teks)" }}>
            Dinas Perumahan, Kawasan Permukiman dan Pertanahan
          </p>
        </div>

        {/* Kartu profil pengguna */}
        <div className="mx-4 mb-5 mt-4 rounded-lg px-4 py-4 text-center" style={{ background: "rgb(255 255 255 / 0.06)" }}>
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          >
            {user.name.trim().charAt(0).toUpperCase() || "U"}
          </div>
          <p className="font-display mt-2.5 truncate text-[15px] font-bold text-white">
            {user.name}
          </p>
          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--sidebar-teks)" }}>
            {user.email}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9fc1e8]">
            {user.role}
          </p>
        </div>

        <nav aria-label="Menu utama" className="flex flex-col gap-1 px-3">
          {MENU.map((m) => {
            const aktif = tab === m.id;
            const href = TAB_PATHS[m.id];
            return (
              <a
                key={m.id}
                href={href}
                aria-current={aktif ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  pindah(m.id);
                }}
                className="flex min-h-11 items-center gap-3 rounded-md px-3.5 py-2.5 text-left text-[15px] no-underline"
                style={{
                  background: aktif ? "var(--sidebar-aktif)" : "transparent",
                  color: aktif ? "#ffffff" : "var(--sidebar-teks)",
                  fontWeight: aktif ? 600 : 400,
                }}
              >
                <Ikon>{IKON_MENU[m.id]}</Ikon>
                {m.label}
              </a>
            );
          })}
        </nav>

        <p className="mt-auto px-5 pb-5 pt-6 text-[11px] leading-relaxed" style={{ color: "var(--sidebar-teks)" }}>
          Disperkimtan Provinsi Sulawesi Selatan
        </p>
      </aside>

      {/* Kolom kanan: topbar + konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe sticky top-0 z-20 flex h-16 items-center gap-2 bg-white px-4 shadow-[0_1px_4px_rgb(16_42_74/0.10)] lg:px-6">
          <button
            type="button"
            aria-label="Buka atau tutup menu samping"
            aria-expanded={sidebarTerbuka}
            onClick={() => setSidebarTerbuka((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-md"
            style={{ color: "var(--accent)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h10" />
            </svg>
          </button>
          <div className="ml-auto">
            <LencanaLive hariIni={hariIni} />
          </div>
          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Profil operator"
              aria-expanded={profilTerbuka}
              onClick={() => setProfilTerbuka((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]"
              style={{ color: "var(--accent)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Keluar"
              onClick={() => setKeluarTerbuka(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]"
              style={{ color: "var(--accent)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
            {profilTerbuka ? (
              <div className="anim-dialog kartu absolute right-0 top-12 z-30 w-72 p-4" role="dialog" aria-label="Profil pengguna">
                <p className="font-display text-[15px] font-bold text-[var(--text)]">{user.name}</p>
                <p className="mt-0.5 text-sm text-[var(--dim)]">{user.email}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {user.role}
                </p>
                <div className="mt-3 flex items-center gap-4 border-t border-[var(--border)] pt-3">
                  <a
                    href={TAB_PATHS.pengaturan}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      pindah("pengaturan");
                    }}
                    className="text-sm font-semibold text-[var(--accent)] no-underline"
                  >
                    Pengaturan
                  </a>
                  <button
                    type="button"
                    onClick={() => { setProfilTerbuka(false); setKeluarTerbuka(true); }}
                    className="text-sm font-semibold"
                    style={{ color: "var(--bad)" }}
                  >
                    Keluar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {state.isPending ? (
            <p className="py-16 text-center text-sm text-[var(--dim)]">Memuat data pegawai…</p>
          ) : state.error ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
                Data gagal dimuat. Periksa koneksi lalu coba lagi.
              </p>
              <button
                type="button"
                onClick={() => state.refetch()}
                className="mt-3 rounded-[var(--radius)] px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                Muat Ulang
              </button>
            </div>
          ) : state.data && state.data.pegawai.length === 0 && tab === "dashboard" ? (
            <div className="py-16 text-center">
              <h2 className="font-display text-xl font-bold text-[var(--text)]">Belum ada data pegawai</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--dim)]">
                Tambahkan pegawai pertama di halaman Data Pegawai untuk mulai menghitung daftar pensiun dan jadwal berkala.
              </p>
              <a
                href={TAB_PATHS.pegawai}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  pindah("pegawai");
                }}
                className="mt-4 inline-block rounded-[var(--radius)] px-4 py-2 text-sm font-semibold no-underline"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                Ke Data Pegawai
              </a>
            </div>
          ) : state.data ? (
            <div key={tab} className="anim-masuk">
              {tab === "dashboard" ? (
                <Dashboard data={terhitung} tanggalAcuan={hariIni} />
              ) : null}
              {tab === "pegawai" ? <HalamanPegawai data={state.data.pegawai} /> : null}
              {tab === "pensiun" ? <HalamanPensiun data={terhitung} /> : null}
              {tab === "berkala" ? <HalamanBerkala data={terhitung} /> : null}
              {tab === "pengaturan" ? (
                <HalamanPengaturan
                  tanggalData={state.data.settings.tanggalData}
                  tanggalAcuan={hariIni}
                />
              ) : null}
              {tab === "catatan" ? <HalamanCatatan /> : null}
            </div>
          ) : null}
        </main>
      </div>

      {/* Dialog keluar */}
      {keluarTerbuka ? (
        <div className="anim-latar fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-label="Keluar dari akun">
          <div className="anim-dialog kartu w-full max-w-md p-5">
            <h3 className="font-display text-lg font-bold text-[var(--text)]">Keluar dari Akun?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--dim)]">
              Anda masuk sebagai <strong>{user.email}</strong>. Data kepegawaian yang sudah disimpan tetap aman di database.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setKeluarTerbuka(false)}
                className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={keluarSibuk}
                onClick={handleLogout}
                className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--bad)" }}
              >
                {keluarSibuk ? "Keluar..." : "Ya, Keluar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
