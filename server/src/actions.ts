// Actions for Sistem Kepegawaian Disperkimtan.
//
// Data pegawai tersimpan di tabel `pegawai` (data induk). Semua hitungan
// pensiun & berkala dilakukan di klien dari data ini + pengaturan tanggal,
// sehingga perubahan data langsung mengubah semua tampilan.

import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD");

const pegawaiInput = z.object({
  nip: z.string().trim().min(1, "NIP wajib diisi").max(30),
  nama: z.string().trim().min(1, "Nama wajib diisi").max(200),
  lahir: isoDate,
  gol: z.string().trim().min(1, "Golongan wajib diisi").max(10),
  tmtGol: isoDate,
  jabatan: z.string().trim().max(300).default(""),
  eselon: z.string().trim().max(50).default(""),
  bup: z.number().int().min(50).max(70),
  cpns: isoDate,
  mkTercatatThn: z.number().int().min(0).max(60),
  mkTercatatBln: z.number().int().min(0).max(11),
  mengabdiThn: z.number().int().min(0).max(60).default(0),
  mengabdiBln: z.number().int().min(0).max(11).default(0),
  tmtKgbTerakhir: isoDate.nullable().default(null),
  unit: z.string().trim().max(300).default(""),
  perluVerifikasi: z.boolean().default(false),
});

const pegawaiRow = z.object({
  id: z.number(),
  nip: z.string(),
  nama: z.string(),
  lahir: z.string(),
  gol: z.string(),
  tmtGol: z.string(),
  jabatan: z.string(),
  eselon: z.string(),
  bup: z.number(),
  cpns: z.string(),
  mkTercatatThn: z.number(),
  mkTercatatBln: z.number(),
  mengabdiThn: z.number(),
  mengabdiBln: z.number(),
  tmtKgbTerakhir: z.string().nullable(),
  unit: z.string(),
  perluVerifikasi: z.boolean(),
});

type PegawaiRow = z.infer<typeof pegawaiRow>;

function toRow(r: typeof schema.pegawai.$inferSelect): PegawaiRow {
  return {
    id: r.id,
    nip: r.nip,
    nama: r.nama,
    lahir: r.lahir,
    gol: r.gol,
    tmtGol: r.tmtGol,
    jabatan: r.jabatan,
    eselon: r.eselon,
    bup: r.bup,
    cpns: r.cpns,
    mkTercatatThn: r.mkTercatatThn,
    mkTercatatBln: r.mkTercatatBln,
    mengabdiThn: r.mengabdiThn,
    mengabdiBln: r.mengabdiBln,
    tmtKgbTerakhir: r.tmtKgbTerakhir,
    unit: r.unit,
    perluVerifikasi: r.perluVerifikasi === 1,
  };
}

const DEFAULT_TANGGAL_DATA = "2026-11-03";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const Actions = {
  getState: defineAction({
    description:
      "Mengambil seluruh data pegawai dan pengaturan tanggal untuk ditampilkan dan dihitung di halaman.",
    request: z.object({}),
    response: z.object({
      pegawai: z.array(pegawaiRow),
      settings: z.object({
        tanggalData: z.string(),
        tanggalAcuan: z.string(),
      }),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.pegawai)
        .orderBy(asc(schema.pegawai.nama));
      const sRows = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, 1));
      const s = sRows[0];
      return {
        pegawai: rows.map(toRow),
        settings: {
          tanggalData: s ? s.tanggalData : DEFAULT_TANGGAL_DATA,
          // Real-time: Tanggal Acuan selalu hari ini, tidak lagi diambil
          // dari nilai yang disimpan manual.
          tanggalAcuan: todayIso(),
        },
      };
    },
  }),

  addPegawai: defineAction({
    description: "Menambah satu pegawai baru ke data induk.",
    request: pegawaiInput,
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const dup = await db
        .select({ id: schema.pegawai.id })
        .from(schema.pegawai)
        .where(eq(schema.pegawai.nip, args.nip));
      if (dup.length > 0) {
        throw new Error(`NIP ${args.nip} sudah terdaftar.`);
      }
      const result = await db
        .insert(schema.pegawai)
        .values({ ...args, perluVerifikasi: args.perluVerifikasi ? 1 : 0 })
        .returning({ id: schema.pegawai.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Gagal menyimpan pegawai baru.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  updatePegawai: defineAction({
    description: "Mengubah data satu pegawai pada data induk.",
    request: pegawaiInput.extend({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const { id, ...rest } = args;
      const dup = await db
        .select({ id: schema.pegawai.id })
        .from(schema.pegawai)
        .where(eq(schema.pegawai.nip, rest.nip));
      if (dup.some((d) => d.id !== id)) {
        throw new Error(`NIP ${rest.nip} sudah dipakai pegawai lain.`);
      }
      await db
        .update(schema.pegawai)
        .set({ ...rest, perluVerifikasi: rest.perluVerifikasi ? 1 : 0 })
        .where(eq(schema.pegawai.id, id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deletePegawai: defineAction({
    description: "Menghapus satu pegawai dari data induk.",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.pegawai)
        .where(eq(schema.pegawai.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  updateSettings: defineAction({
    description:
      "Menyimpan Tanggal Data; Tanggal Acuan bersifat real-time (selalu hari ini) dan tidak diatur manual.",
    request: z.object({ tanggalData: isoDate, tanggalAcuan: isoDate }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.settings)
        .values({ id: 1, ...args })
        .onConflictDoUpdate({
          target: schema.settings.id,
          set: { tanggalData: args.tanggalData, tanggalAcuan: args.tanggalAcuan },
        });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  seedPegawai: defineAction({
    description:
      "Mengimpor data awal pegawai dari file data ASN kantor (hanya berjalan bila tabel pegawai masih kosong).",
    request: z.object({
      records: z
        .array(
          z.object({
            nip: z.string().min(1).max(30),
            nama: z.string().min(1).max(200),
            lahir: isoDate,
            gol: z.string().min(1).max(10),
            tmtGol: isoDate,
            jabatan: z.string().max(300).default(""),
            eselon: z.string().max(50).default(""),
            bup: z.number().int().min(50).max(70),
            cpns: isoDate,
            mkT: z.number().int().min(0).max(60),
            mkB: z.number().int().min(0).max(11),
            unit: z.string().max(300).default(""),
          }),
        )
        .max(500),
    }),
    response: z.object({ inserted: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select({ id: schema.pegawai.id })
        .from(schema.pegawai)
        .limit(1);
      if (existing.length > 0) {
        return { inserted: 0 };
      }
      // Masa Mengabdi = masa kerja file − masa kerja hitungan dari TMT CPNS
      // sampai Tanggal Data (2026-11-03), dihitung dalam bulan.
      const refY = 2026;
      const refM = 11;
      const statements: BatchItem<"sqlite">[] = args.records.map((r) => {
        const cpnsY = Number(r.cpns.slice(0, 4));
        const cpnsM = Number(r.cpns.slice(5, 7));
        const hitungBln = (refY - cpnsY) * 12 + (refM - cpnsM);
        const fileBln = r.mkT * 12 + r.mkB;
        const mengabdiBln = Math.max(0, fileBln - hitungBln);
        // Umur saat mulai mengabdi = umur saat CPNS − masa mengabdi.
        const lahirY = Number(r.lahir.slice(0, 4));
        const lahirM = Number(r.lahir.slice(5, 7));
        const umurCpnsBln = (cpnsY - lahirY) * 12 + (cpnsM - lahirM);
        const umurMulaiBln = umurCpnsBln - mengabdiBln;
        const perluVerifikasi = umurMulaiBln < 17 * 12 ? 1 : 0;
        return db.insert(schema.pegawai).values({
          nip: r.nip,
          nama: r.nama,
          lahir: r.lahir,
          gol: r.gol,
          tmtGol: r.tmtGol,
          jabatan: r.jabatan,
          eselon: r.eselon,
          bup: r.bup,
          cpns: r.cpns,
          mkTercatatThn: r.mkT,
          mkTercatatBln: r.mkB,
          mengabdiThn: Math.floor(mengabdiBln / 12),
          mengabdiBln: mengabdiBln % 12,
          tmtKgbTerakhir: null,
          unit: r.unit,
          perluVerifikasi,
        });
      });
      const [first, ...rest] = statements;
      if (first) {
        await db.batch([first, ...rest]);
      }
      ctx.invalidateQueries();
      return { inserted: args.records.length };
    },
  }),

  importPegawai: defineAction({
    description:
      "Mengimpor data pegawai dari template Excel (menambah data baru, atau memperbarui/melewati NIP yang sudah ada).",
    request: z.object({
      mode: z.enum(["skip", "update"]).default("skip"),
      records: z.array(pegawaiInput).min(1, "Minimal 1 baris data.").max(500),
    }),
    response: z.object({
      inserted: z.number(),
      updated: z.number(),
      skipped: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select({ id: schema.pegawai.id, nip: schema.pegawai.nip })
        .from(schema.pegawai);
      const nipToId = new Map(existing.map((e) => [e.nip, e.id]));

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const r of args.records) {
        const existingId = nipToId.get(r.nip);
        if (existingId !== undefined) {
          if (args.mode === "update") {
            await db
              .update(schema.pegawai)
              .set({ ...r, perluVerifikasi: r.perluVerifikasi ? 1 : 0 })
              .where(eq(schema.pegawai.id, existingId));
            updated += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        const res = await db
          .insert(schema.pegawai)
          .values({ ...r, perluVerifikasi: r.perluVerifikasi ? 1 : 0 })
          .returning({ id: schema.pegawai.id });
        const row = res[0];
        if (row) nipToId.set(r.nip, row.id);
        inserted += 1;
      }

      ctx.invalidateQueries();
      return { inserted, updated, skipped };
    },
  }),
} satisfies ActionsModule;
