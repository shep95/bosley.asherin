#!/usr/bin/env node
/**
 * guards against build-only regressions that dev mode hides:
 * the minifier once folded `animation-timeline` into the `animation`
 * shorthand, which browsers reject, killing the header surface and the
 * reading progress line in production only.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = "dist/client/_astro";
const css = (await Promise.all((await readdir(dir)).filter((f) => f.endsWith(".css")).map((f) => readFile(join(dir, f), "utf8")))).join("\n");
const fails = [];
if (/animation:[^;}]*scroll\(/.test(css)) fails.push("a scroll() timeline was folded into an animation shorthand");
if (!/animation-timeline:\s*scroll\(root\)/.test(css)) fails.push("reading progress timeline missing");
if (!/\[hidden\]\{display:none!important\}/.test(css.replace(/\s/g, ""))) fails.push("[hidden] rule missing");
if (fails.length) { console.error("dist check failed:\n- " + fails.join("\n- ")); process.exit(1); }
console.log("dist check passed.");
