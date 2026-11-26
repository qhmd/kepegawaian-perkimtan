# Data Plan

## Context provenance
- `sebenmarnya bukan excel sih, tapi saya ingin membuat siste` + `untuk di pakai di kantor, lewat browser` (prior user statements; the artifact is a full-stack browser system, not a spreadsheet file)
- Spesifikasi lengkap pada brief pembangunan (assistant-drafted spec explicitly carried into this build request): aturan BUP, TMT Pensiun = tanggal 1 bulan berikutnya setelah genap BUP, Masa Kerja saat pensiun = (TMT Pensiun − TMT CPNS) + Masa Mengabdi, pola KGB ganjil/genap per golongan, MKG maksimum PP 5/2024 (I=27, II=33, III=32, IV=32), status Berkala, halaman Dashboard/Data Pegawai/Pensiun/Berkala/Pengaturan/Catatan, format DD-MM-YYYY dan `X thn Y bln`.
- `Data awal (seed): 69 pegawai unik dari file ~/workspace/user/files/seed-data-asn.json ... JANGAN mengarang data pegawai lain.` (build brief; seed is user-supplied data, imported once via post-submit action)

## Tested sources
### File seed pegawai (user-supplied)
**Used by**: `seedPegawai` action (post-submit, insert-if-empty), which computes Masa Mengabdi per record and stores editable rows in `pegawai`
**Test command**: `python3 -c json.load` on `~/workspace/user/files/seed-data-asn.json` + field audit script
**Sample output**: list of 69 records, fields `nip, nama, lahir, gol, tmtGol, jabatan, eselon, bup, cpns, mkT, mkB, unit`; 69 unique NIPs; golongan present: II/d, III/a–III/d, IV/a, IV/b; BUP all 58; NIP first-8-digits match `lahir` for all rows
**Processing**: Masa Mengabdi (bulan) = (mkT×12+mkB) − bulan dari TMT CPNS ke Tanggal Data 2026-11-03. Verified: Saktiyani (cpns 2006-04, mk 35 thn 6 bln, lahir 1983-10-01) → mengabdi 179 bln = 14 thn 11 bln → mulai kerja di bawah umur 17 → flag `perlu verifikasi`. No negative mengabdi values in the set.

## Long-term data behavior
- **Refresh policy**: none — data pegawai is user-maintained office data, changed only through the in-app forms; no external refresh or cron.
- **Growth**: pegawai rows grow only via user add/edit/delete; settings is a single row (id=1).
- **Ordering**: Pensiun sorted by TMT Pensiun ascending; Berkala sorted with status `Berkala` first by TMT KGB ascending, `Tidak` rows last.
- **Time semantics**: all dates stored as ISO `YYYY-MM-DD` text, displayed DD-MM-YYYY; month arithmetic done in whole months; Tanggal Data default 2026-11-03 (editable in Pengaturan — it is the validity date of the source file, not "today"). Tanggal Acuan is REAL-TIME since the 2026-11-25 edit (`saya ingin datanya real time tidak perlu di atur manual kayak hari ini`): it is never stored or set manually — the client computes local today via `useHariIni()` (re-checked every 20s, rolls over at midnight without reload) and `getState` on the server also returns `todayIso()` for it; all computations (MKG, Dashboard windows) use that live date. The client also refetches `getState` every 60s.

## Perbaikan rumus MKG (2026-11-25)
- Brief user: `Perbaiki rumus MKG di halaman Berkala: MKG saat ini = Masa Kerja Tercatat + bulan yang berlalu dari Tanggal Data ke Tanggal Acuan. Masa Kerja Tercatat sudah mencakup Masa Mengabdi, jadi Masa Mengabdi jangan ditambahkan lagi`.
- Diperbaiki di `hitungBerkala` (client/src/hitung.ts): komponen Masa Mengabdi dihapus dari MKG. Rumus pensiun (`hitungPensiun`) TIDAK diubah — di sana Masa Mengabdi memang ditambahkan karena basisnya (TMT Pensiun − TMT CPNS) belum mencakup masa sebelum CPNS.
- Verifikasi: Qamariyah Hasby (IV/a, tercatat 31 thn 7 bln, mengabdi 13 thn 8 bln) kini MKG 31 thn 7 bln, berikutnya 32, status "Berkala" (sebelumnya ±45 thn → "Tidak — MKG sudah mentok"). Saktiyani (III/c, tercatat 35 thn 6 bln) tetap "mentok" karena memang di atas maks III = 32.

## Rejected approaches
- **Tried**: seeding via SQL migration or hardcoding the 69 records in server source
  **Why rejected**: build rules forbid hardcoding the seed set into source; the sanctioned path is a `post_submit_action` (`seedPegawai`) invoked once against the durable DB, insert-if-empty so user edits are never overwritten.
- **Tried**: computing Pensiun/Berkala server-side per request
  **Why rejected**: the rules are pure functions of pegawai rows + the two setting dates; computing client-side from `getState` keeps every page instantly consistent after any edit, with the DB as the single source of truth.
