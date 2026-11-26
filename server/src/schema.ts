import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Data induk pegawai — satu-satunya tempat data diketik. Semua tampilan
// (Pensiun, Berkala, Dashboard) dihitung dari baris-baris ini.
export const pegawai = sqliteTable("pegawai", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nip: text("nip").notNull(),
  nama: text("nama").notNull(),
  // Tanggal ISO YYYY-MM-DD
  lahir: text("lahir").notNull(),
  gol: text("gol").notNull(),
  tmtGol: text("tmt_gol").notNull(),
  jabatan: text("jabatan").notNull().default(""),
  eselon: text("eselon").notNull().default(""),
  bup: integer("bup").notNull().default(58),
  // TMT CPNS (tanggal 1 pada bulan pengangkatan)
  cpns: text("cpns").notNull(),
  // Masa kerja tercatat pada file sumber, per Tanggal Data
  mkTercatatThn: integer("mk_tercatat_thn").notNull().default(0),
  mkTercatatBln: integer("mk_tercatat_bln").notNull().default(0),
  // Masa mengabdi (masa kerja sebelum CPNS yang diakui) — bisa diedit
  mengabdiThn: integer("mengabdi_thn").notNull().default(0),
  mengabdiBln: integer("mengabdi_bln").notNull().default(0),
  // TMT KGB terakhir (opsional); bila terisi, KGB berikutnya = ini + 2 tahun
  tmtKgbTerakhir: text("tmt_kgb_terakhir"),
  unit: text("unit").notNull().default(""),
  // 1 bila hasil hitung masa mengabdi tidak masuk akal (perlu dicek manual)
  perluVerifikasi: integer("perlu_verifikasi").notNull().default(0),
});

// Pengaturan tunggal (satu baris, id = 1)
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  tanggalData: text("tanggal_data").notNull(),
  tanggalAcuan: text("tanggal_acuan").notNull(),
});

// Akun pengguna (login email/kata sandi atau Google OAuth)
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  role: text("role").notNull().default("Operator"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});
