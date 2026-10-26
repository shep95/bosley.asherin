/**
 * Turn a Supabase/PostgREST error into short, lowercase copy for a toast.
 * Database rate limits raise P0001 "rate limit exceeded ..." (see
 * 20260927120000_abuse_resistance.sql); unique violations are 23505.
 */
export type DbErrorLike = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

export const isRateLimitError = (error: DbErrorLike | unknown): boolean => {
  const e = error as DbErrorLike;
  if (!e) return false;
  const text = `${e.message ?? ""} ${e.hint ?? ""}`.toLowerCase();
  return text.includes("rate limit") || text.includes("slow_down");
};

export const isUniqueViolation = (error: DbErrorLike | unknown): boolean =>
  (error as DbErrorLike)?.code === "23505";

export const SLOW_DOWN = "slow down for a minute.";

/** Short reason for a failed write, with a fallback for everything unexpected. */
export const friendlyDbError = (error: DbErrorLike | unknown, fallback = "that did not work. try again."): string => {
  if (isRateLimitError(error)) return SLOW_DOWN;
  const e = error as DbErrorLike;
  const msg = (e?.message ?? "").trim();
  // Messages raised by our own triggers are written for people; pass them on.
  if (e?.code === "42501" && msg && !msg.includes("row-level security")) return msg.toLowerCase();
  return fallback;
};
