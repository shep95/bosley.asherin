import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * wcag contrast of the design tokens. text colours are ivory at an opacity,
 * so each one is composited over what is actually behind it: the room's
 * black, and the brightest gold streak of the wallpaper seen through the veil.
 */
const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
type RGB = [number, number, number];
type RGBA = [number, number, number, number];

function token(name: string): RGBA {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`no token ${name}`);
  const v = m[1]!.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = v.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4])];
  throw new Error(`unparsed token ${name}: ${v}`);
}
const over = ([r, g, b, a]: RGBA, [R, G, B]: RGB): RGB => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
const lum = (c: RGB) => {
  const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

const bg = over(token("bg"), [0, 0, 0]);
const streak: RGB = over(token("veil"), [214, 172, 96]); // brightest wallpaper streak, under the veil
const scrim = over(token("scrim"), streak);

describe("contrast (wcag 2.2)", () => {
  it.each([
    ["ink", 7, 4.5], ["ink-2", 4.5, 4.5], ["ink-3", 4.5, 3], ["ink-4", 3, 3], ["gold", 4.5, 3],
  ])("%s on the room ≥ %s:1, on a lit streak ≥ %s:1", (name, onBg, onStreak) => {
    const fg = token(name as string);
    expect(ratio(over(fg, bg), bg)).toBeGreaterThanOrEqual(onBg as number);
    expect(ratio(over(fg, streak), streak)).toBeGreaterThanOrEqual(onStreak as number);
  });
  it("words on reading surfaces stay legible even over a streak", () => {
    expect(ratio(over(token("ink-2"), scrim), scrim)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(over(token("ink-4"), scrim), scrim)).toBeGreaterThanOrEqual(3);
  });
  it("words on the gold signal", () => {
    expect(ratio(over(token("gold-ink"), [0, 0, 0]), over(token("gold"), [0, 0, 0]))).toBeGreaterThanOrEqual(7);
  });
});
