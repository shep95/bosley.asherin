import { solve } from "../lib/pow";

/**
 * proof-of-work for one target (a post's conversation, or "new-post"). it
 * starts quietly when someone begins to write and is usually done before they
 * finish, so publishing feels instant.
 */
export function worker(target: string) {
  let job: Promise<{ challenge: string; nonce: string }> | null = null;
  let abort: AbortController | null = null;
  const start = () => {
    if (job) return job;
    abort = new AbortController();
    const signal = abort.signal;
    job = (async () => {
      const res = await fetch(`/api/challenge?post=${encodeURIComponent(target)}`);
      if (!res.ok) throw new Error(res.status === 503 ? "resting" : "challenge");
      const ch = (await res.json()) as { challenge?: unknown; bits?: unknown };
      // never spin on a malformed answer: a missing bit count would mean searching forever
      if (typeof ch.challenge !== "string" || typeof ch.bits !== "number" || ch.bits < 1 || ch.bits > 24) throw new Error("challenge");
      return { challenge: ch.challenge, nonce: await solve(ch.challenge, ch.bits, { signal }) };
    })();
    job.catch(() => { job = null; });
    return job;
  };
  const reset = () => { job = null; abort = null; };
  const cancel = () => { abort?.abort(); reset(); };
  return { start, reset, cancel };
}
