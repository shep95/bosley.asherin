import { supabase } from '@/integrations/supabase/client';

/**
 * Have I Been Pwned (HIBP) breach check using k-anonymity.
 *
 * SECURITY: This runs entirely in the browser. The plaintext password is
 * SHA-1 hashed locally via WebCrypto and only the first 5 hex characters of
 * the hash are sent to api.pwnedpasswords.com — the password itself never
 * leaves the device and never touches our servers/logs.
 */
export async function checkPasswordBreached(
  password: string
): Promise<{ breached: boolean; message: string }> {
  try {
    if (!password || typeof password !== 'string') {
      return { breached: false, message: '' };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { headers: { 'Add-Padding': 'true' } }
    );

    if (!response.ok) {
      return { breached: false, message: '' };
    }

    const text = await response.text();
    for (const line of text.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10);
        if (count > 0) {
          return {
            breached: true,
            message: `This password has been found in ${count.toLocaleString()} data breaches. Please choose a different password.`,
          };
        }
      }
    }
    return { breached: false, message: '' };
  } catch {
    // Fail open — don't block registration if HIBP is unreachable.
    return { breached: false, message: '' };
  }
}

export async function checkLoginRateLimit(email: string): Promise<{ locked: boolean; message: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('check-login-rate', {
      body: { email, action: 'check' }
    });
    
    if (error) {
      console.error('Rate limit check failed:', error);
      return { locked: false, message: null };
    }
    
    return data;
  } catch {
    return { locked: false, message: null };
  }
}

export async function recordLoginAttempt(email: string, success: boolean): Promise<void> {
  try {
    await supabase.functions.invoke('check-login-rate', {
      // NOTE: never send ip_address from the client — the edge function
      // derives the real IP from x-forwarded-for server-side.
      body: { email, action: 'record', success }
    });
  } catch {
    // Non-blocking
  }
}
