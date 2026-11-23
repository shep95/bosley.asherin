import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** wcag contrast of the design tokens, computed from their oklch values. */
const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
function token(name: string): [number, number, number] {
  const m = css.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!m) throw new Error(`no token ${name}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function luminance([L, C, H]: [number, number, number]): number {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(bl);
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(token(a)), luminance(token(b))].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe("contrast (wcag 2.2)", () => {
  it.each([
    ["ink", "bg", 7], ["ink", "surface", 7], ["ink-muted", "bg", 4.5], ["ink-muted", "surface", 4.5],
    ["gold", "bg", 4.5], ["gold-bright", "surface", 4.5], ["ink-faint", "bg", 3],
  ])("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(ratio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number);
  });
});
