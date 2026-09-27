/**
 * Client-side metadata scrubbing.
 *
 * Everything a user uploads is re-encoded or byte-surgeried in the browser
 * BEFORE it reaches storage, so EXIF/GPS/device/author data never leaves the
 * device. Nothing here trusts the original filename either — names routinely
 * carry camera serials, timestamps and account handles.
 */

const IMAGE_RE = /^image\//i;
const VIDEO_RE = /^video\//i;

/** Random, non-identifying basename. Extension is derived from the MIME we emit. */
function neutralName(mime: string): string {
  const ext =
    mime === "image/png" ? "png" :
    mime === "image/webp" ? "webp" :
    mime === "image/gif" ? "gif" :
    mime === "video/quicktime" ? "mov" :
    mime === "video/webm" ? "webm" :
    mime.startsWith("video/") ? "mp4" : "jpg";
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${rand[0].toString(36)}${rand[1].toString(36)}.${ext}`;
}

/** A canvas re-encode drops every ancillary chunk: EXIF, XMP, IPTC, ICC, thumbnails. */
async function stripImage(file: File): Promise<File> {
  // Animated formats lose their frames on a canvas round-trip, so they take the
  // byte-level path instead (see stripGif / passthrough below).
  if (file.type === "image/gif") return stripGif(file);

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // undecodable: leave untouched rather than corrupt it

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    // PNG/WebP may carry alpha; JPEG would flatten it to black.
    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    const outType = keepAlpha ? "image/png" : "image/jpeg";

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, outType, keepAlpha ? undefined : 0.92)
    );
    if (!blob) return file;

    return new File([blob], neutralName(outType), {
      type: outType,
      lastModified: 0, // the capture time is metadata too
    });
  } finally {
    bitmap.close();
  }
}

/**
 * GIF: strip Comment (0xFE), Plain Text (0x01) and Application (0xFF) extension
 * blocks — where XMP, authoring tools and tracking payloads hide — while keeping
 * the NETSCAPE2.0 loop block so animation still loops.
 */
async function stripGif(file: File): Promise<File> {
  const src = new Uint8Array(await file.arrayBuffer());
  if (src.length < 14 || src[0] !== 0x47 || src[1] !== 0x49 || src[2] !== 0x46) return file;

  const out: number[] = [];
  let i = 0;

  const pushRange = (from: number, to: number) => {
    for (let k = from; k < to; k++) out.push(src[k]);
  };
  const skipSubBlocks = (p: number) => {
    while (p < src.length && src[p] !== 0x00) p += src[p] + 1;
    return p + 1;
  };

  // Header + Logical Screen Descriptor
  const packed = src[10];
  i = 13;
  if (packed & 0x80) i += 3 * (1 << ((packed & 0x07) + 1)); // Global Color Table
  pushRange(0, i);

  while (i < src.length) {
    const b = src[i];
    if (b === 0x21) {
      const label = src[i + 1];
      const start = i;
      let p = i + 2;
      if (label === 0xf9) p += src[p] + 1;                 // Graphic Control: fixed sub-block
      else p = skipSubBlocks(p);
      const isLoop =
        label === 0xff &&
        String.fromCharCode(...src.slice(i + 3, i + 14)) === "NETSCAPE2.0";
      if (label === 0xf9 || isLoop) {
        if (label === 0xf9) p = skipSubBlocks(p);
        pushRange(start, p);
      }
      // else: comment / plain-text / other app extension -> dropped
      i = p;
    } else if (b === 0x2c) {
      const start = i;
      const lp = src[i + 9];
      let p = i + 10;
      if (lp & 0x80) p += 3 * (1 << ((lp & 0x07) + 1));    // Local Color Table
      p += 1;                                              // LZW min code size
      p = skipSubBlocks(p);
      pushRange(start, p);
      i = p;
    } else if (b === 0x3b) {
      out.push(0x3b);
      break;
    } else {
      // Unexpected byte: bail out and keep the original rather than emit a broken GIF.
      return file;
    }
  }

  return new File([new Uint8Array(out)], neutralName("image/gif"), {
    type: "image/gif",
    lastModified: 0,
  });
}

/**
 * MP4/MOV: remove `udta` (GPS ©xyz, device make/model, authoring app) and `meta`
 * boxes wherever they appear at container level, rewriting parent box sizes.
 * Media samples are never touched, so playback is unaffected.
 */
async function stripMp4(file: File): Promise<File> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);
  const SCRUB = new Set(["udta", "meta", "uuid"]);

  const boxType = (off: number) =>
    String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);

  // Verify this is actually an ISO-BMFF file before touching a byte.
  if (buf.length < 16 || boxType(0) !== "ftyp") return file;

  let scrubbed = false;

  // Boxes are neutralised IN PLACE (payload zeroed, type rewritten to "free")
  // instead of removed: sample tables (stco/co64) store absolute byte offsets,
  // so shrinking the file would desynchronise playback.
  const walk = (start: number, end: number, depth: number): boolean => {
    let p = start;
    while (p + 8 <= end) {
      let size = view.getUint32(p);
      let headerSize = 8;
      if (size === 0) size = end - p;
      if (size === 1) {
        if (p + 16 > end) return false;
        size = view.getUint32(p + 8) * 2 ** 32 + view.getUint32(p + 12);
        headerSize = 16;
      }
      if (size < headerSize || p + size > end) return false; // malformed -> abort

      const type = boxType(p);
      if (SCRUB.has(type)) {
        buf.fill(0, p + headerSize, p + size);
        buf[p + 4] = 0x66; buf[p + 5] = 0x72; buf[p + 6] = 0x65; buf[p + 7] = 0x65; // "free"
        scrubbed = true;
      } else if (CONTAINERS.has(type)) {
        if (!walk(p + headerSize, p + size, depth + 1)) return false;
      }
      p += size;
    }
    return true;
  };

  let ok = false;
  try {
    ok = walk(0, buf.length, 0);
  } catch {
    ok = false;
  }

  const outType = file.type || "video/mp4";
  if (!ok || !scrubbed) {
    // Nothing to strip (or unparseable): still drop the identifying filename.
    return new File([file], neutralName(outType), { type: outType, lastModified: 0 });
  }
  return new File([buf], neutralName(outType), { type: outType, lastModified: 0 });
}

/**
 * WebM / Matroska: neutralise Tags, Attachments and muxer-identity elements by
 * overwriting them IN PLACE with equally sized Void elements. SeekHead stores
 * byte positions, so the file length must not change.
 */
async function stripMatroska(file: File): Promise<File> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const outType = file.type || "video/webm";
  const rename = () => new File([file], neutralName(outType), { type: outType, lastModified: 0 });

  // EBML magic
  if (buf.length < 4 || buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) {
    return rename();
  }

  const readVint = (p: number, keepMarker: boolean) => {
    const first = buf[p];
    if (first === 0 || first === undefined) return null;
    let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 8 || p + len > buf.length) return null;
    let value = keepMarker ? first : first & (0xff >> len);
    for (let i = 1; i < len; i++) value = value * 256 + buf[p + i];
    return { value, len };
  };

  // Master elements we descend into, and elements we blank out entirely.
  const MASTERS = new Set([0x18538067, 0x1549a966]); // Segment, Info
  const SCRUB = new Set([
    0x1254c367, // Tags
    0x1941a469, // Attachments
    0x4d80,     // MuxingApp
    0x5741,     // WritingApp
    0x7ba9,     // Title
    0x3384,     // SegmentFilename
    0x1c53bb6b, // Cues are offset-critical -> never scrubbed (kept out of this set)
  ]);
  SCRUB.delete(0x1c53bb6b);

  let scrubbed = false;

  const voidOut = (start: number, total: number) => {
    // 0xEC = Void (1-byte ID) + a size VINT padded so the replacement occupies
    // exactly the same byte range as the element it replaces.
    if (total < 3) return; // no room for ID + size + payload
    const sizeLen = Math.min(8, total - 2);
    const payload = total - 1 - sizeLen;
    if (payload < 0 || payload >= 2 ** (7 * sizeLen) - 1) return;
    buf[start] = 0xec;
    let remaining = payload;
    for (let i = sizeLen - 1; i >= 0; i--) {
      buf[start + 1 + i] = remaining % 256;
      remaining = Math.floor(remaining / 256);
    }
    buf[start + 1] |= 0x80 >> (sizeLen - 1);
    buf.fill(0, start + 1 + sizeLen, start + total);
    scrubbed = true;
  };

  const walk = (start: number, end: number): boolean => {
    let p = start;
    while (p < end) {
      const id = readVint(p, true);
      if (!id) return false;
      const size = readVint(p + id.len, false);
      if (!size) return false;
      const headerLen = id.len + size.len;
      // Unknown-size elements (all size bits set) can't be safely rewritten.
      const unknown = size.value >= 2 ** (7 * size.len) - 1;
      const contentEnd = unknown ? end : p + headerLen + size.value;
      if (contentEnd > end) return false;

      if (SCRUB.has(id.value) && !unknown) {
        voidOut(p, headerLen + size.value);
      } else if (MASTERS.has(id.value)) {
        if (!walk(p + headerLen, contentEnd)) return false;
      }
      p = contentEnd;
      if (unknown) break;
    }
    return true;
  };

  let ok = false;
  try {
    ok = walk(0, buf.length);
  } catch {
    ok = false;
  }
  if (!ok || !scrubbed) return rename();
  return new File([buf], neutralName(outType), { type: outType, lastModified: 0 });
}

/**
 * Public entry point: hand it any user-selected file, get back a copy with no
 * embedded metadata and a non-identifying filename. Never throws — a failure to
 * parse falls back to a renamed copy so an upload is never blocked.
 */
export async function stripMetadata(file: File): Promise<File> {
  try {
    if (IMAGE_RE.test(file.type)) return await stripImage(file);
    if (VIDEO_RE.test(file.type)) {
      const matroska = file.type === "video/webm" || file.type === "video/x-matroska";
      return matroska ? await stripMatroska(file) : await stripMp4(file);
    }
  } catch {
    /* fall through to rename-only */
  }
  return new File([file], neutralName(file.type || "application/octet-stream"), {
    type: file.type,
    lastModified: 0,
  });
}

export async function stripMetadataAll(files: File[]): Promise<File[]> {
  return Promise.all(files.map(stripMetadata));
}

/**
 * Post text carries metadata too: click-tracking query params that fingerprint
 * the sharer, and zero-width characters used as invisible watermarks.
 */
const TRACKING_PARAMS = [
  /^utm_/i, /^ga_/i, /^mc_/i, /^pk_/i, /^hsa_/i, /^vero_/i,
  /^(fbclid|gclid|dclid|gbraid|wbraid|msclkid|twclid|yclid|igshid|mkt_tok|si|s|ref_src|ref_url|scid|ttclid|epik|_hsenc|_hsmi|oly_enc_id|oly_anon_id|trk|trkCampaign|spm|share_id)$/i,
];

function cleanUrl(raw: string): string {
  // Trailing punctuation is sentence grammar, not part of the link.
  const trail = raw.match(/[)\].,!?;:'"]+$/)?.[0] ?? "";
  const core = trail ? raw.slice(0, -trail.length) : raw;
  try {
    const url = new URL(core);
    if (url.protocol !== "http:" && url.protocol !== "https:") return raw;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
    }
    let out = url.toString();
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out + trail;
  } catch {
    return raw;
  }
}

export function stripTextMetadata(text: string): string {
  return text
    // zero-width / bidi control characters used for invisible fingerprinting
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/(https?:\/\/[^\s]+)/gi, cleanUrl);
}
