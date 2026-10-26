/** The first thousand accounts are founding members. Earned by arriving, never sold. */
export const FOUNDING_LIMIT = 1000;

export const formatMemberNumber = (n?: number | null) => (n == null ? "—" : String(n).padStart(4, "0"));

export const isFounding = (n?: number | null) => n != null && n <= FOUNDING_LIMIT;
