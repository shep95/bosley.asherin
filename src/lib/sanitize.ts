/**
 * Input sanitization utilities for defense-in-depth security.
 * All user inputs should pass through these before use.
 */

/** Strip HTML tags to prevent XSS */
export const stripHtml = (input: string): string => {
  return input.replace(/<[^>]*>/g, '');
};

/** Sanitize string: trim, limit length, strip HTML */
export const sanitizeString = (input: string, maxLength = 1000): string => {
  if (typeof input !== 'string') return '';
  return stripHtml(input.trim()).slice(0, maxLength);
};

/** Sanitize email: lowercase, trim, validate format */
export const sanitizeEmail = (email: string): string => {
  const sanitized = email.trim().toLowerCase().slice(0, 255);
  return sanitized;
};

/** Sanitize username: alphanumeric + underscore only */
export const sanitizeUsername = (username: string): string => {
  return username
    .trim()
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9_]/g, '');
};

/** Validate and sanitize URL */
export const sanitizeUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

/** Sanitize file name to prevent path traversal */
export const sanitizeFileName = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
};

/** Allowed raster image types. SVG is intentionally excluded — SVG is XML and can
 * carry inline <script> producing stored XSS when served with image/svg+xml. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

export const isAllowedFileType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

/**
 * Verify a file's actual magic bytes match its declared MIME type. The browser
 * `file.type` is attacker-controlled (it's derived from the file extension),
 * so anything making a security decision must validate the binary signature.
 * Returns true if the bytes match the declared type, false otherwise.
 */
export const verifyFileMagicBytes = async (file: File): Promise<boolean> => {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  const type = file.type;

  // JPEG: FF D8 FF
  if (type === 'image/jpeg') return hex.startsWith('ffd8ff');
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (type === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  // GIF: 47 49 46 38 (GIF8)
  if (type === 'image/gif') return hex.startsWith('474946383761') || hex.startsWith('474946383961');
  // WebP: RIFF....WEBP
  if (type === 'image/webp') return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  // MP4: ....ftyp
  if (type === 'video/mp4') return hex.slice(8, 16) === '66747970';
  // WebM: 1A 45 DF A3 (EBML)
  if (type === 'video/webm') return hex.startsWith('1a45dfa3');
  return false;
};

/** Maximum file sizes */
export const MAX_FILE_SIZES = {
  avatar: 5 * 1024 * 1024,      // 5MB
  image: 10 * 1024 * 1024,      // 10MB
  video: 100 * 1024 * 1024,     // 100MB
  background: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * Client-side rate-limit throttle backed by localStorage so the counter survives
 * page refreshes and tab restarts. This is UX defense in depth only — the
 * server-side rate limiter is the real enforcement.
 */
const RL_PREFIX = 'bosley_rl_';

export const isRateLimited = (key: string, maxAttempts: number, windowMs: number): boolean => {
  const storageKey = RL_PREFIX + key;
  const now = Date.now();
  try {
    const raw = localStorage.getItem(storageKey);
    const entry = raw ? (JSON.parse(raw) as { count: number; resetAt: number }) : null;

    if (!entry || now > entry.resetAt) {
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, resetAt: now + windowMs }));
      return false;
    }

    entry.count++;
    localStorage.setItem(storageKey, JSON.stringify(entry));
    return entry.count > maxAttempts;
  } catch {
    // localStorage unavailable (private mode / quota) — fail open and rely on server limit
    return false;
  }
};

/**
 * Escape a user-supplied value before interpolating it into a PostgREST filter
 * string such as `.or('username.ilike.%foo%')` or `.ilike('col', '%foo%')`.
 * Commas, parentheses and dots are filter grammar; `%` and `_` are LIKE
 * wildcards; backslashes are escapes. Stripping them keeps the filter shape
 * fixed no matter what the user typed.
 */
export const escapeFilterValue = (input: string, maxLength = 100): string =>
  (input ?? '')
    .replace(/[,()\\%_*."'`;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

/** Map an allow-listed MIME type to the storage extension we emit. Never trust the filename. */
export const extensionForMime = (mime: string): string | null => {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'video/mp4': return 'mp4';
    case 'video/webm': return 'webm';
    default: return null;
  }
};

/**
 * Full upload gate: allow-listed MIME, size cap, and magic-byte match.
 * Returns an error string for the UI or null when the file is acceptable.
 */
export const validateUpload = async (
  file: File,
  allowedTypes: string[],
  maxBytes: number,
): Promise<string | null> => {
  if (!isAllowedFileType(file, allowedTypes)) return 'That file type is not supported.';
  if (file.size > maxBytes) return `File is too large (max ${Math.round(maxBytes / 1024 / 1024)}MB).`;
  if (!(await verifyFileMagicBytes(file))) return 'File contents do not match its type.';
  return null;
};

/**
 * Safe value for a CSS `background-image` declaration. Only http(s) and blob
 * URLs are accepted and the string is escaped so it cannot close the url().
 */
export const cssUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) return undefined;
    return `url("${parsed.toString().replace(/["\\\n\r]/g, '')}")`;
  } catch {
    return undefined;
  }
};
