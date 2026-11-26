@echo off
chcp 65001 >nul
cd /d %~dp0
set "BUN=bun"
if exist "%USERPROFILE%\.bun\bin\bun.exe" set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
"%BUN%" --version >nul 2>nul
if errorlevel 1 goto :nobun
if exist node_modules goto :havepkgs
echo Pertama kali: mengunduh paket yang dibutuhkan...
"%BUN%" install
if errorlevel 1 goto :installfail
:havepkgs
if exist client\dist\index.html goto :havebuild
echo Membangun tampilan web...
"%BUN%" run build
if errorlevel 1 goto :buildfail
:havebuild
echo Menjalankan Sistem Kepegawaian Disperkimtan...
echo Buka browser ke http://localhost:4173
echo Tutup jendela ini untuk menghentikan.
"%BUN%" run start
pause
exit /b 0
:nobun
echo Bun belum terpasang di laptop ini.
echo.
echo Pasang dulu dari https://bun.sh - buka PowerShell lalu jalankan:
echo   powershell -c "irm bun.sh/install.ps1 | iex"
echo Setelah itu tutup jendela ini dan klik ganda lagi JALANKAN.bat
pause
exit /b 1
:installfail
echo Gagal mengunduh paket. Periksa koneksi internet lalu coba lagi.
pause
exit /b 1
:buildfail
echo Build gagal. Lihat pesan di atas.
pause
exit /b 1
