import { describe, expect, it } from "vitest";
import { cleanName, cleanText, COMMENT_ID, SLUG } from "../src/lib/validate";
import { ulid } from "../src/lib/server/ulid";
import { allow } from "../src/lib/server/ratelimit";

describe("comment text", () => {
  it("normalises whitespace and strips invisible and control characters", () => {
    const r = cleanText("  hi​ there‮\r\n\r\n\r\n\r\nok\u0007  ");
    expect(r).toEqual({ ok: true, text: "hi there\n\nok" });
  });
  it("keeps markup as plain text (it is never rendered as html)", () => {
    expect(cleanText("<img src=x onerror=alert(1)>")).toEqual({ ok: true, text: "<img src=x onerror=alert(1)>" });
  });
  it("enforces length, link and key-mash limits", () => {
    expect(cleanText("a").ok).toBe(false);
    expect(cleanText("x".repeat(1001)).ok).toBe(false);
    expect(cleanText("a https://a.b b https://c.d c https://e.f").ok).toBe(false);
    expect(cleanText("ok " + "z".repeat(40)).ok).toBe(false);
    expect(cleanText(42).ok).toBe(false);
  });
});

describe("names", () => {
  it("allows empty (anonymous) and ordinary names", () => {
    expect(cleanName("")).toEqual({ ok: true, name: null });
    expect(cleanName("  maya  r. ")).toEqual({ ok: true, name: "maya r." });
    expect(cleanName("Zoë_O'Neil")).toEqual({ ok: true, name: "Zoë_O'Neil" });
  });
  it("refuses reserved, symbol-laden and overlong names", () => {
    for (const n of ["admin", "Bosley", "<b>", "a".repeat(33), "x‮y"]) {
      const r = cleanName(n);
      if (n === "x‮y") expect(r).toEqual({ ok: true, name: "xy" });
      else expect(r.ok).toBe(false);
    }
  });
});

describe("ids and paths", () => {
  it("ulids sort by time and match the id pattern", () => {
    const a = ulid(1_700_000_000_000), b = ulid(1_700_000_000_001);
    expect(a < b).toBe(true);
    expect(COMMENT_ID.test(a)).toBe(true);
  });
  it("slugs cannot escape the comment folder", () => {
    for (const s of ["../etc", "a/../b", "/abs", "a b", "A", ""]) expect(SLUG.test(s) && !s.includes("..")).toBe(false);
    expect(SLUG.test("my-first-post")).toBe(true);
  });
});

describe("rate limit", () => {
  it("allows five per window, then asks to wait", () => {
    const k = "test-" + Math.random();
    for (let i = 0; i < 5; i++) expect(allow(k, 5, 60_000, 1000 + i).ok).toBe(true);
    const r = allow(k, 5, 60_000, 2000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(allow(k, 5, 60_000, 70_000).ok).toBe(true);
  });
});
