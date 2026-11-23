import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyTag, signedMessage, verifySignature } from "../src/lib/server/identity";
import { forYou, why } from "../src/lib/rank";

describe("optional signed identity", () => {
  it("verifies a browser-style ecdsa signature and rejects altered text or private keys", async () => {
    const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
    const pub = { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! };
    const msg = signedMessage("post", "hello there", "maya", "chal");
    const sig = Buffer.from(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(msg))).toString("base64url");
    expect(await verifySignature(pub, sig, msg)).toBe(keyTag(pub));
    expect(await verifySignature(pub, sig, signedMessage("post", "hello there!", "maya", "chal"))).toBeNull();
    const priv = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
    expect(await verifySignature(priv, sig, msg)).toBeNull();
    expect(await verifySignature({ kty: "RSA" }, sig, msg)).toBeNull();
  });
});

describe("for you (on-device ranking)", () => {
  const now = Date.parse("2026-11-23T00:00:00Z");
  const day = 86_400_000;
  const items = [
    { slug: "new-cooking", tags: ["cooking"], date: now - day },
    { slug: "old-design", tags: ["design"], date: now - 60 * day },
    { slug: "mid-design", tags: ["design", "type"], date: now - 10 * day },
  ];
  it("keeps newest first when nothing is known yet", () => {
    expect(forYou(items, {}, new Set(), now).map((x) => x.slug)).toEqual(["new-cooking", "mid-design", "old-design"]);
  });
  it("lifts what the reader likes and sinks what they've read", () => {
    const order = forYou(items, { design: 4 }, new Set(["mid-design"]), now).map((x) => x.slug);
    expect(order[0]).toBe("old-design");
    expect(order.at(-1)).toBe("mid-design");
  });
  it("explains itself", () => {
    expect(why(["design"], { design: 2 })).toBe("because you read #design");
    expect(why(["cooking"], { design: 2 })).toBeNull();
  });
});
