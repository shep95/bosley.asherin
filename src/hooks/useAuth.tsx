import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { checkPasswordBreached, checkLoginRateLimit, recordLoginAttempt } from '@/lib/securityChecks';
import { sanitizeEmail, sanitizeUsername } from '@/lib/sanitize';
import { clearQueue } from '@/lib/offlineQueue';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mfaRequired: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null; mfaRequired?: boolean }>;
  signOut: () => Promise<void>;
  clearMfaRequired: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Ask GoTrue what assurance level the current session actually has. MFA is
 * required when the account has a verified factor (nextLevel === 'aal2') but
 * the session was only established with a password (currentLevel !== 'aal2').
 * This is the single source of truth: React state alone is bypassable, since
 * `signInWithPassword` already hands out an aal1 session before TOTP runs.
 */
const checkMfaRequired = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Resolve the AAL for a freshly established session before we drop the
    // loading gate, so ProtectedRoute never renders children on an aal1
    // session that still owes a TOTP step.
    const applySession = async (next: Session | null) => {
      const required = next ? await checkMfaRequired() : false;
      if (cancelled) return;
      setSession(next);
      setUser(next?.user ?? null);
      setMfaRequired(required);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        // Defer the async work off the callback tick; supabase-js warns against
        // awaiting other auth calls directly inside onAuthStateChange.
        setTimeout(() => { void applySession(next); }, 0);
      }
    );

    supabase.auth.getSession().then(({ data: { session: next } }) => applySession(next));

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, username: string): Promise<{ error: string | null }> => {
    try {
      // Sanitize inputs before any backend call
      const cleanEmail = sanitizeEmail(email);
      const cleanUsername = sanitizeUsername(username);

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { error: 'Please enter a valid email address.' };
      }
      if (cleanUsername.length < 3) {
        return { error: 'Username must be at least 3 characters (letters, numbers, underscore).' };
      }
      if (password.length < 12) {
        return { error: 'Password must be at least 12 characters.' };
      }

      // Check if password has been breached
      const hibpResult = await checkPasswordBreached(password);
      if (hibpResult.breached) {
        return { error: hibpResult.message };
      }

      // Check if username is taken
      const { data: usernameTaken } = await supabase.rpc('is_username_taken', { 
        check_username: cleanUsername 
      });
      
      if (usernameTaken) {
        return { error: 'Username is already taken' };
      }

      // Check if email domain is blocked
      const { data: emailBlocked } = await supabase.rpc('is_email_domain_blocked', { 
        email: cleanEmail 
      });
      
      if (emailBlocked) {
        return { error: 'Temporary email addresses are not allowed' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: cleanUsername }
        }
      });

      if (error) {
        // Generic message — never reveal whether the email is already registered
        return { error: 'Unable to create account. Please try a different email or try again later.' };
      }

      // The profile row is created server-side by the `handle_new_user` trigger
      // (works even when email confirmation means there is no session yet, and
      // for OAuth users). This client-side write is only a fallback for the
      // brief window where a session exists and the trigger did not run.
      if (data.user && data.session) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (!existing) {
          await supabase
            .from('profiles')
            .insert({ user_id: data.user.id, username: cleanUsername, display_name: cleanUsername });
        }
      }

      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null; mfaRequired?: boolean }> => {
    try {
      const cleanEmail = sanitizeEmail(email);

      // Check rate limiting
      const rateCheck = await checkLoginRateLimit(cleanEmail);
      if (rateCheck.locked) {
        return { error: rateCheck.message || 'Account temporarily locked. Try again in 15 minutes.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error) {
        // Record failed attempt
        await recordLoginAttempt(cleanEmail, false);
        // Generic error message - never leak whether email exists
        return { error: 'Invalid credentials. Please check your email and password.' };
      }

      // Record successful attempt
      await recordLoginAttempt(cleanEmail, true);

      // Check if MFA is required — derived from the session's real assurance
      // level, the same check onAuthStateChange and ProtectedRoute rely on.
      const required = await checkMfaRequired();
      setMfaRequired(required);
      if (required) {
        return { error: null, mfaRequired: true };
      }

      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMfaRequired(false);
    // Clear locally cached drafts/media so they don't leak on shared devices
    try { clearQueue(); } catch { /* noop */ }
  };

  /**
   * Re-check the AAL instead of blindly clearing. The gate only opens once the
   * session has genuinely been upgraded to aal2 by a successful TOTP verify.
   * Resolves to the new `mfaRequired` value.
   */
  const clearMfaRequired = useCallback(async (): Promise<boolean> => {
    const required = await checkMfaRequired();
    setMfaRequired(required);
    return required;
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, mfaRequired, signUp, signIn, signOut, clearMfaRequired }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
