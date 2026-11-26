SISTEM KEPEGAWAIAN DISPERKIMTAN — VERSI STANDALONE (jalan di laptop tanpa Muse)
================================================================================

Salinan aplikasi web Sistem Kepegawaian Disperkimtan per 25 Nov 2026, yang
sudah diubah supaya bisa jalan sendiri di laptop (Windows) tanpa Muse.

CARA MENJALANKAN (Windows)
--------------------------
1. Pasang Bun (sekali saja): buka PowerShell, jalankan
     powershell -c "irm bun.sh/install.ps1 | iex"
   lalu tutup PowerShell itu dan buka lagi (atau restart laptop).
2. Klik ganda JALANKAN.bat di folder ini.
   - Pertama kali, JALANKAN.bat akan mengunduh paket (butuh internet) dan
     membangun tampilan web, lalu menjalankan server.
3. Buka browser ke http://localhost:4173
4. Untuk berhenti, tutup jendela JALANKAN.bat (Ctrl+C).

Bila port 4173 sudah dipakai aplikasi lain, jalankan lewat PowerShell:
     $env:KEPEGAWAIAN_PORT=4180; bun run start
lalu buka http://localhost:4180

ISI PAKET
---------
- client/ ......... tampilan web (React + TypeScript)
- server/ ......... logika server: src/actions.ts (aksi simpan/baca data),
                    src/schema.ts (skema database), standalone.ts (server
                    web mandiri: menyajikan halaman + melayani /actions)
- drizzle/ ........ migrasi SQL pembentuk tabel database
- vendor/ ......... paket @hatch/space-sdk (dibutuhkan aplikasi; ikut
                    disertakan supaya tidak perlu mengunduh dari Muse)
- app.db .......... DATABASE — seluruh data pegawai (69 orang) tinggal di
                    file ini. BACKUP file ini sebelum pindah laptop atau
                    sebelum mengubah-ubah; kalau file ini hilang, datanya
                    hilang (tapi bisa dibuat ulang dari seed di bawah).
- seed-data-asn.json ... data awal 69 pegawai. Dipakai otomatis bila
                    app.db dihapus/dibuat baru (tabel kosong).
- scripts/build-client.ts ... skrip build tampilan web (dipakai JALANKAN.bat)
- JALANKAN.bat ..... peluncur Windows (klik ganda)
- README.txt ....... file ini

PERINTAH MANUAL (di PowerShell/terminal, dari folder ini)
--------------------------------------------------------
  bun install        unduh paket (sekali, atau sesudah update)
  bun run build      bangun ulang tampilan web ke client/dist/
  bun run start      jalankan server (http://localhost:4173)
  bun run typecheck  periksa tipe TypeScript client + server

CATATAN
-------
- Ini salinan per 25 Nov 2026, sudah termasuk perbaikan rumus KGB
  (MKG = Masa Kerja Tercatat + bulan berlalu; Masa Mengabdi tidak
  ditambahkan dua kali) dan Tanggal Acuan real-time (selalu hari ini).
- Aturan hitung (pensiun & KGB) ada di client/src/hitung.ts — file ini
  sama persis dengan versi di Muse.
- Data hanya tersimpan lokal di app.db di folder ini; tidak ada data yang
  dikirim ke internet. Font tampilan dimuat dari Google Fonts bila ada
  internet; tanpa internet tampilan memakai font sistem.
- Aplikasi ini single-user di laptop sendiri (tanpa login). Jangan
  mengekspos port 4173 ke internet/Jaringan kantor tanpa pengaman.
