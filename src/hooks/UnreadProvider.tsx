import type { ReactNode } from 'react';
import { UnreadProviderContext, useUnreadRealtime } from '@/hooks/useUnread';

/**
 * Mount once, inside AuthProvider and around the routes, so it survives page
 * changes. Owns the only realtime channel for badge counts and the only
 * browser notifications. Read the counts anywhere with `useUnread()`.
 */
export const UnreadProvider = ({ children }: { children: ReactNode }) => {
  useUnreadRealtime();
  return <UnreadProviderContext.Provider value={true}>{children}</UnreadProviderContext.Provider>;
};

export default UnreadProvider;
