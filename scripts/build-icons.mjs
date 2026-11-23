#!/usr/bin/env node
/**
 * Rasterise Everydaypane brand SVGs into favicons, Apple touch icons and PWA icons.
 * Sources live in public/brand/; outputs go to public/icons/, public/ and src/app/.
 *
 *   node scripts/build-icons.mjs
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "public/brand");
const iconsDir = path.join(root, "public/icons");
const publicDir = path.join(root, "public");
const appDir = path.join(root, "src/app");

const mark = path.join(brand, "mark.svg");
const faviconSvg = path.join(brand, "favicon.svg");
const appleSvg = path.join(brand, "apple.svg");
const maskableSvg = path.join(brand, "maskable.svg");

/** Standard + Apple + PWA sizes from the rounded mark (UI, tabs, browser chrome). */
const MARK_SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 512];

/** Full-bleed Apple home-screen sizes (iOS applies its own mask). */
const APPLE_SIZES = [
  { size: 120, name: "apple-touch-icon-120.png" }, // iPhone @2x
  { size: 152, name: "apple-touch-icon-152.png" }, // iPad
  { size: 167, name: "apple-touch-icon-167.png" }, // iPad Pro
  { size: 180, name: "apple-touch-icon-180.png" }, // iPhone @3x (primary)
];

const MASKABLE_SIZES = [192, 512];

async function raster(svgPath, size, outPath, { flatten } = {}) {
  let pipeline = sharp(await readFile(svgPath), { density: Math.max(300, size * 4) }).resize(size, size, {
    fit: "fill",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (flatten) {
    // Apple touch icons must be opaque; iOS does not composite transparency well.
    pipeline = pipeline.flatten({ background: { r: 42, g: 55, b: 150 } });
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
}

/** Pack PNG buffers into a multi-size .ico (PNG-compressed entries, as modern browsers expect). */
function pngsToIco(entries) {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const dirs = [];
  for (const { size, png } of entries) {
    dirs.push({ size, png, offset });
    offset += png.length;
  }
  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(count, 4);
  let dirAt = 6;
  for (const { size, png, offset: off } of dirs) {
    buf.writeUInt8(size >= 256 ? 0 : size, dirAt);
    buf.writeUInt8(size >= 256 ? 0 : size, dirAt + 1);
    buf.writeUInt8(0, dirAt + 2);
    buf.writeUInt8(0, dirAt + 3);
    buf.writeUInt16LE(1, dirAt + 4);
    buf.writeUInt16LE(32, dirAt + 6);
    buf.writeUInt32LE(png.length, dirAt + 8);
    buf.writeUInt32LE(off, dirAt + 12);
    png.copy(buf, off);
    dirAt += 16;
  }
  return buf;
}

async function main() {
  await mkdir(iconsDir, { recursive: true });

  for (const size of MARK_SIZES) {
    await raster(size <= 48 ? faviconSvg : mark, size, path.join(iconsDir, `icon-${size}.png`));
  }

  for (const { size, name } of APPLE_SIZES) {
    await raster(appleSvg, size, path.join(iconsDir, name), { flatten: true });
  }
  // Canonical names iOS looks for at the site root and Next's app/ convention.
  await copyFile(path.join(iconsDir, "apple-touch-icon-180.png"), path.join(iconsDir, "apple-touch-icon.png"));
  await copyFile(path.join(iconsDir, "apple-touch-icon-180.png"), path.join(publicDir, "apple-touch-icon.png"));
  await copyFile(path.join(iconsDir, "apple-touch-icon-180.png"), path.join(appDir, "apple-icon.png"));

  for (const size of MASKABLE_SIZES) {
    await raster(maskableSvg, size, path.join(iconsDir, `maskable-${size}.png`), { flatten: true });
  }

  // favicon.ico: 16 + 32 + 48 from the small-size SVG (with clock hands).
  const icoPngs = [];
  for (const size of [16, 32, 48]) {
    const png = await sharp(await readFile(faviconSvg), { density: 384 })
      .resize(size, size, { fit: "fill" })
      .png()
      .toBuffer();
    icoPngs.push({ size, png });
  }
  const ico = pngsToIco(icoPngs);
  await writeFile(path.join(appDir, "favicon.ico"), ico);
  await writeFile(path.join(publicDir, "favicon.ico"), ico);

  // Next.js and the display shell both serve the SVG favicon.
  await copyFile(faviconSvg, path.join(appDir, "icon.svg"));
  await copyFile(faviconSvg, path.join(publicDir, "icon.svg"));

  console.log(
    `Icons written: ${MARK_SIZES.length} mark PNGs, ${APPLE_SIZES.length} Apple, ${MASKABLE_SIZES.length} maskable, favicon.ico, icon.svg`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
