import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export const useIdleTimeout = () => {
  const { user, signOut } = useAuth();
  // Depend on the stable id, not the user object: token refreshes hand back a
  // new object with the same identity, which would otherwise tear down and
  // re-arm the timer (and re-bind every listener) on each refresh.
  const userId = user?.id ?? null;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const handleIdle = useCallback(async () => {
    if (userId) {
      await signOut();
      // Redirect handled by auth state change
    }
  }, [userId, signOut]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (userId) {
      timerRef.current = setTimeout(handleIdle, IDLE_TIMEOUT_MS);
    }
  }, [userId, handleIdle]);

  useEffect(() => {
    if (!userId) return;

    // Start timer
    resetTimer();

    // Listen for activity
    EVENTS.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    // Check on visibility change (tab switch back)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= IDLE_TIMEOUT_MS) {
          handleIdle();
        } else {
          resetTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENTS.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, resetTimer, handleIdle]);
};
