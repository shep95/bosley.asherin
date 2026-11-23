#!/usr/bin/env node
/**
 * strips every piece of hidden data from images committed to this repo:
 * exif (camera, serial numbers, dates), gps location, xmp (editing history,
 * software), iptc (names, captions) and icc profiles that can identify a device.
 *
 * the build already re-encodes images it publishes without metadata, but the
 * originals sit in git history forever, so they must be clean too.
 *
 *   npm run images:scrub   rewrite any image that carries metadata
 *   npm run images:check   fail (exit 1) if any image still does — run in ci
 *   --roots a,b            folders to walk (default: src,public). the build
 *                          runs it on the source before astro, and on the
 *                          output after, so no published file can carry metadata.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";

const rootsArg = process.argv.find((a) => a.startsWith("--roots="));
const ROOTS = rootsArg ? rootsArg.slice(8).split(",") : ["src", "public"];
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff", ".gif", ".heic", ".heif"]);
const check = process.argv.includes("--check");

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(extname(e.name).toLowerCase())) yield p;
  }
}

/** what hidden data an image carries, by name. empty = clean. */
export async function hiddenData(buf) {
  const m = await sharp(buf, { animated: true }).metadata();
  const found = [];
  if (m.exif) found.push("exif");
  if (m.xmp) found.push("xmp");
  if (m.iptc) found.push("iptc");
  if (m.icc && m.format !== "png") found.push("icc");
  if (m.comments?.length) found.push("comments");
  return found;
}

export async function scrub(buf, ext) {
  // .rotate() bakes the exif orientation into the pixels before exif is dropped,
  // so photos keep their correct way up. sharp writes no metadata unless asked.
  let img = sharp(buf, { animated: ext === ".gif" || ext === ".webp" }).rotate();
  switch (ext) {
    case ".jpg": case ".jpeg": img = img.jpeg({ quality: 88, mozjpeg: true }); break;
    case ".png": img = img.png({ compressionLevel: 9, adaptiveFiltering: true }); break;
    case ".webp": img = img.webp({ quality: 88 }); break;
    case ".avif": img = img.avif({ quality: 62 }); break;
    case ".gif": img = img.gif(); break;
    default: img = img.jpeg({ quality: 88, mozjpeg: true });
  }
  return img.toBuffer();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

async function main() {
let dirty = 0, cleaned = 0, total = 0;
for (const root of ROOTS) {
  for await (const file of walk(root)) {
    total++;
    const buf = await readFile(file);
    let found;
    try { found = await hiddenData(buf); } catch (err) { console.error(`  ! cannot read ${file}: ${err.message}`); dirty++; continue; }
    if (found.length === 0) continue;
    if (check) { console.error(`  ✗ ${file} carries ${found.join(", ")}`); dirty++; continue; }
    const ext = extname(file).toLowerCase();
    await writeFile(file, await scrub(buf, ext));
    console.log(`  ✓ ${file}: removed ${found.join(", ")}`);
    cleaned++;
  }
}

if (check) {
  if (dirty) { console.error(`\n${dirty} of ${total} images carry hidden data. run: npm run images:scrub`); process.exit(1); }
  console.log(`all ${total} images are clean.`);
} else {
  console.log(cleaned ? `cleaned ${cleaned} of ${total} images.` : `all ${total} images were already clean.`);
}
}
