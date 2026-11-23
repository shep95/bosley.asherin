/**
 * everything personal stays in this browser. storage can be unavailable
 * (private mode, blocked storage), so every access is guarded and the site
 * keeps working without it.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`bosley:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try { localStorage.setItem(`bosley:${key}`, JSON.stringify(value)); } catch { /* storage unavailable: carry on */ }
}

export function forget(key: string): void {
  try { localStorage.removeItem(`bosley:${key}`); } catch { /* nothing to do */ }
}

export type Affinity = Record<string, number>;

/** a finished read nudges its tags up; old interests fade so the feed follows you. */
export function learnFrom(tags: string[]): void {
  if (!tags.length) return;
  const a = load<Affinity>("affinity", {});
  for (const k of Object.keys(a)) a[k] = (a[k] ?? 0) * 0.9;
  for (const t of tags) a[t] = (a[t] ?? 0) + 1;
  save("affinity", a);
}
