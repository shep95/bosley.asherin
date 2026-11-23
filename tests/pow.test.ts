import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { leadingZeroBits, meetsTarget, sha256Hex, sha256Words, solve } from "../src/lib/pow";
import { issueChallenge, leadingZeroBitsBuf, verifyChallenge } from "../src/lib/server/challenge";

const node = (s: string) => createHash("sha256").update(s).digest("hex");

describe("sha256 (browser implementation)", () => {
  it("matches node:crypto on edge-length and unicode inputs", () => {
    const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(119), "x".repeat(1000), "héllo 🌙 世界"];
    for (const s of inputs) expect(sha256Hex(s)).toBe(node(s));
  });
  it("counts leading zero bits the same as the server", () => {
    for (const s of ["a", "b:1", "c:zz", "d:42"]) {
      expect(leadingZeroBits(sha256Words(s))).toBe(leadingZeroBitsBuf(createHash("sha256").update(s).digest()));
    }
  });
});

describe("proof-of-work challenge", () => {
  const secret = "s".repeat(40);
  it("accepts a solved challenge once, then rejects the replay", async () => {
    const { challenge } = issueChallenge(secret, "hello-world", Date.now(), 10);
    const nonce = await solve(challenge, 10);
    expect(meetsTarget(challenge, nonce, 10)).toBe(true);
    expect(verifyChallenge(secret, challenge, nonce, "hello-world")).toMatchObject({ ok: true });
    expect(verifyChallenge(secret, challenge, nonce, "hello-world")).toEqual({ ok: false, reason: "replay" });
  });
  it("rejects unsolved, tampered, foreign, wrong-post and expired challenges", async () => {
    const now = Date.now();
    const { challenge } = issueChallenge(secret, "p1", now, 12);
    const nonce = await solve(challenge, 12);
    let bad = "0"; while (meetsTarget(challenge, bad, 12)) bad += "0";
    expect(verifyChallenge(secret, challenge, bad, "p1")).toEqual({ ok: false, reason: "work" });
    const [body, mac] = challenge.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), b: 0 })).toString("base64url");
    expect(verifyChallenge(secret, `${forged}.${mac}`, nonce, "p1").ok).toBe(false);
    expect(verifyChallenge("x".repeat(40), challenge, nonce, "p1")).toEqual({ ok: false, reason: "signature" });
    expect(verifyChallenge(secret, challenge, nonce, "p2")).toEqual({ ok: false, reason: "post" });
    expect(verifyChallenge(secret, challenge, nonce, "p1", now + 11 * 60_000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyChallenge(secret, "garbage", "1", "p1").ok).toBe(false);
    expect(verifyChallenge(secret, challenge, "<script>", "p1").ok).toBe(false);
  });
});
