import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { clearQueue } from '@/lib/offlineQueue';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;
/** Last activity in ANY tab of this browser, shared through localStorage. */
const ACTIVITY_KEY = 'bosley:last-activity';
/** Writing on every scroll event would thrash storage and wake every tab. */
const WRITE_THROTTLE_MS = 5_000;

const readShared = (): number => {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
};

const writeShared = (t: number) => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(t));
  } catch {
    /* storage blocked: fall back to this tab's own activity */
  }
};

/**
 * Sign out after 15 minutes without activity in every open tab.
 *
 * Activity is shared across tabs (localStorage + the `storage` event), so a
 * background tab never logs out a user who is busy in another one. The sign
 * out is local-scope: it ends this browser's session only, never the user's
 * sessions on other devices.
 */
export const useIdleTimeout = () => {
  const { user } = useAuth();
  // Depend on the stable id, not the user object: token refreshes hand back a
  // new object with the same identity.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastLocal = Date.now();
    let lastWrite = 0;
    let signingOut = false;

    const lastActivity = () => Math.max(lastLocal, readShared());

    const signOutLocal = async () => {
      if (signingOut) return;
      signingOut = true;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        // Same hygiene as useAuth().signOut: no cached drafts on a shared device.
        try { clearQueue(); } catch { /* noop */ }
      }
      // Redirect is handled by the auth state change.
    };

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, Math.max(1_000, ms));
    };

    function check() {
      const idleFor = Date.now() - lastActivity();
      if (idleFor >= IDLE_TIMEOUT_MS) void signOutLocal();
      else schedule(IDLE_TIMEOUT_MS - idleFor);
    }

    const markActive = () => {
      const now = Date.now();
      lastLocal = now;
      if (now - lastWrite >= WRITE_THROTTLE_MS) {
        lastWrite = now;
        writeShared(now);
        schedule(IDLE_TIMEOUT_MS);
      }
    };

    // Another tab was active: push our deadline out to match.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) check();
    };

    // Coming back to a tab after sleep or a long switch: re-evaluate now.
    const onVisibility = () => {
      if (!document.hidden) check();
    };

    markActive();
    EVENTS.forEach((event) => document.addEventListener(event, markActive, { passive: true }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      EVENTS.forEach((event) => document.removeEventListener(event, markActive));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);
};
