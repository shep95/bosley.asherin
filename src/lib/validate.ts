/**
 * comment text rules. comments are plain text only: they are rendered with
 * textContent in the browser and never as html, so markup in a comment is
 * shown as typed and cannot run.
 */

export const MAX_TEXT = 1000;
export const MAX_NAME = 32;
export const MAX_LINKS = 2;

// control characters except newline and tab; bidi overrides (text-direction spoofing);
// zero-width characters used to hide or disguise text.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const BIDI = /[‪-‮⁦-⁩‎‏؜]/g;
const ZERO_WIDTH = /[​-‍⁠﻿᠎]/g;

export function cleanText(input: unknown, max = MAX_TEXT, maxLinks = MAX_LINKS): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "say something first." };
  let t = input.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(BIDI, "").replace(ZERO_WIDTH, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length < 2) return { ok: false, error: "say a little more." };
  if (t.length > max) return { ok: false, error: `keep it under ${max.toLocaleString("en")} characters.` };
  const links = t.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? [];
  if (links.length > maxLinks) return { ok: false, error: `at most ${maxLinks} links.` };
  if (/(.)\1{29,}/u.test(t)) return { ok: false, error: "that looks like a key held down." };
  return { ok: true, text: t };
}

export const MAX_POST = 5000;
export const MAX_TITLE = 120;

/** a visitor post's title: one line, no markup meaning, 3–120 characters. */
export function cleanTitle(input: unknown): { ok: true; title: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "give it a title." };
  const t = input.normalize("NFC").replace(CONTROL, "").replace(BIDI, "").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  if (t.length < 3) return { ok: false, error: "give it a title of a few words." };
  if (t.length > MAX_TITLE) return { ok: false, error: `titles are up to ${MAX_TITLE} characters.` };
  return { ok: true, title: t };
}

export function cleanName(input: unknown): { ok: true; name: string | null } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, name: null };
  if (typeof input !== "string") return { ok: false, error: "names are text." };
  const n = input.normalize("NFC").replace(CONTROL, "").replace(BIDI, "").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  if (!n) return { ok: true, name: null };
  if (n.length > MAX_NAME) return { ok: false, error: `names are up to ${MAX_NAME} characters.` };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(n)) return { ok: false, error: "names use letters, numbers, spaces, . _ ' -" };
  if (/^(bosley|admin|asher|owner|moderator|mod)$/i.test(n)) return { ok: false, error: "that name is reserved." };
  return { ok: true, name: n };
}

export const SLUG = /^[a-z0-9][a-z0-9-/]{0,118}[a-z0-9]$/;
export const COMMENT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** visitor posts live at /v/<id>; their conversation key is "v-<id, lower-case>". */
export const VISITOR_KEY = /^v-[0-9a-hjkmnp-tv-z]{26}$/;
