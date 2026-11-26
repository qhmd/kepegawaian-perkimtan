// Build client standalone — replikasi konfigurasi buildClient() dari
// @hatch/space-sdk/build, TANPA guard HATCH_SPACES_BUILD_DRIVER (guard itu
// hanya berlaku untuk artifact Muse; proyek ini memang diniatkan jalan
// sendiri di laptop).
//
// Harus dijalankan dari root proyek (cwd = folder ini), karena macro
// actionFields di App.tsx membaca server/src/actions.ts relatif terhadap
// process.cwd() saat build.

import { basename, join } from "node:path";
import { rm, cp, access } from "node:fs/promises";
import tailwindPlugin from "bun-plugin-tailwind";

const ENTRY = "./client/index.html";
const OUTDIR = "./client/dist";

// Versi platform yang dikompilasi ke bundle (sama dengan space.json).
const PLATFORM_VERSION = 31;

await rm(OUTDIR, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUTDIR,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __HATCH_SPACE_PLATFORM_VERSION__: JSON.stringify(PLATFORM_VERSION),
  },
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("Build client gagal; lihat pesan di atas.");
}

// Bun menulis aset impor ke `assets/<nama>-<hash>.<ext>` tapi mengacu
// URL-nya sebagai `./<nama>-<hash>.<ext>` tanpa prefix `assets/`.
// Tambahkan prefix itu kembali (sama seperti yang dilakukan SDK).
const assetFiles = result.outputs
  .filter((output) => output.kind === "asset")
  .map((output) => basename(output.path));

for (const output of result.outputs) {
  if (!/\.(js|css|html)$/.test(output.path)) continue;
  let text = await output.text();
  let changed = false;
  for (const name of assetFiles) {
    const bare = `./${name}`;
    if (text.includes(bare)) {
      text = text.split(bare).join(`./assets/${name}`);
      changed = true;
    }
  }
  if (changed) await Bun.write(output.path, text);
}

// Salin isi client/public/ ke dist/ (logo, favicon, dsb.)
const PUBLIC_DIR = "./client/public";
try {
  await access(PUBLIC_DIR);
  await cp(PUBLIC_DIR, OUTDIR, { recursive: true });
  console.log("File publik disalin dari client/public/ ke dist/");
} catch {
  // Tidak ada folder public, lanjut saja
}

console.log(`Build client selesai: ${OUTDIR}/`);
for (const output of result.outputs) {
  console.log("  ", output.path);
}
