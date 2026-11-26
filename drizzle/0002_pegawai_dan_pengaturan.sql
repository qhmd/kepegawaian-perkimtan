DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE pegawai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nip TEXT NOT NULL,
  nama TEXT NOT NULL,
  lahir TEXT NOT NULL,
  gol TEXT NOT NULL,
  tmt_gol TEXT NOT NULL,
  jabatan TEXT NOT NULL DEFAULT '',
  eselon TEXT NOT NULL DEFAULT '',
  bup INTEGER NOT NULL DEFAULT 58,
  cpns TEXT NOT NULL,
  mk_tercatat_thn INTEGER NOT NULL DEFAULT 0,
  mk_tercatat_bln INTEGER NOT NULL DEFAULT 0,
  mengabdi_thn INTEGER NOT NULL DEFAULT 0,
  mengabdi_bln INTEGER NOT NULL DEFAULT 0,
  tmt_kgb_terakhir TEXT,
  unit TEXT NOT NULL DEFAULT '',
  perlu_verifikasi INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  tanggal_data TEXT NOT NULL,
  tanggal_acuan TEXT NOT NULL
);
