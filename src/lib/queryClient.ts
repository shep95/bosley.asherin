import { QueryClient } from "@tanstack/react-query";

/**
 * The one QueryClient for the app. It lives in its own module so the auth
 * provider can clear it on sign-out / account switch without importing App
 * (which would be a cycle).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Remounting a route (tab-switch, back-navigation) previously refired
      // every query, so returning to the feed re-fetched posts, profiles and
      // signed URLs that were seconds old.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
