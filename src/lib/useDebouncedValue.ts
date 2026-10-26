import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Make free text safe inside an ilike pattern: escapes the LIKE wildcards
 * (% _ and the backslash itself) and drops PostgREST's `*` wildcard alias.
 * Use with .ilike(column, `%${escapeLike(term)}%`), never inside .or().
 */
export function escapeLike(term: string): string {
  return term.replace(/\*/g, "").replace(/[\\%_]/g, (m) => `\\${m}`);
}
