import { forget, load, save } from "./local";

/** base64url without padding, for signatures sent to the server. */
export const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Stored = { pub: JsonWebKey; priv: JsonWebKey };

/** the visitor's optional signing key — made and kept in this browser only. */
export async function identityKey(): Promise<{ pub: JsonWebKey; priv: CryptoKey } | null> {
  if (!crypto?.subtle) return null;
  let stored = load<Stored | null>("identity", null);
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
    stored = { pub: { kty: "EC", crv: "P-256", x: pub.x!, y: pub.y! }, priv };
    save("identity", stored);
  }
  const priv = await crypto.subtle.importKey("jwk", stored.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { pub: stored.pub, priv };
}

export async function sign(message: string): Promise<{ pub: JsonWebKey; sig: string } | null> {
  const id = await identityKey();
  if (!id) return null;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, id.priv, new TextEncoder().encode(message));
  return { pub: id.pub, sig: b64url(sig) };
}

export async function myTag(): Promise<string | null> {
  const stored = load<Stored | null>("identity", null);
  if (!stored) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${stored.pub.x}.${stored.pub.y}`));
  return [...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function forgetIdentity(): void { forget("identity"); forget("name"); }

export const signedMessage = (key: string, text: string, name: string, challenge: string) =>
  `bosley-comment-v1\n${key}\n${name}\n${challenge}\n${text}`;
