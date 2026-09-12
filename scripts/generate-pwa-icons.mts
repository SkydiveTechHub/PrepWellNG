/**
 * Renders the PWA raster icons from src/app/icon.svg.
 *
 * Deliberately NOT wired into `npm run build`. The output is committed, so a
 * normal build has no dependency on sharp or on rendering; this exists so the
 * icons are reproducible when the branding changes. Run it by hand:
 *
 *   npx tsx scripts/generate-pwa-icons.mts
 */
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "src/app/icon.svg");
const OUT_DIR = path.join(ROOT, "public");

// The brand blue already used as the tile fill in icon.svg.
const BRAND = "#1d4ed8";

// Android crops a maskable icon to a circle of roughly 80% of the canvas.
// Anything outside that safe zone can be cut, so the artwork is inset and the
// remainder is flooded with the brand colour rather than left transparent —
// a transparent maskable icon renders as a white-bordered blob.
const MASKABLE_SAFE_RATIO = 0.8;

async function renderPlain(size: number, outFile: string) {
  const svg = readFileSync(SOURCE);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outFile);
}

async function renderMaskable(size: number, outFile: string) {
  const svg = readFileSync(SOURCE);
  const inner = Math.round(size * MASKABLE_SAFE_RATIO);
  const artwork = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - inner) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: artwork, top: offset, left: offset }])
    .png()
    .toFile(outFile);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  await renderPlain(192, path.join(OUT_DIR, "icon-192.png"));
  await renderPlain(512, path.join(OUT_DIR, "icon-512.png"));
  await renderMaskable(192, path.join(OUT_DIR, "icon-192-maskable.png"));
  await renderMaskable(512, path.join(OUT_DIR, "icon-512-maskable.png"));

  console.log("Wrote 4 PWA icons to public/");
}

await main();
