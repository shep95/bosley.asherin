import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ulid: 48-bit time + 80 random bits, crockford base32. sorts by time as text. */
export function ulid(now = Date.now()): string {
  let t = now, time = "";
  for (let i = 0; i < 10; i++) { time = ALPHABET[t % 32] + time; t = Math.floor(t / 32); }
  const rnd = randomBytes(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[rnd[i]! % 32];
  return time + rand;
}
