
-- Login attempts tracking for rate limiting
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only edge functions (service role) can insert/read - no client access
CREATE POLICY "No direct client access to login_attempts"
ON public.login_attempts
FOR ALL
USING (false);

-- Index for fast lookups by email and time
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (email, created_at DESC);

-- Auto-cleanup: delete attempts older than 24 hours
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Function to check if account is locked (5+ failures in 15 min)
CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failure_count integer;
BEGIN
  SELECT COUNT(*) INTO failure_count
  FROM public.login_attempts
  WHERE email = LOWER(check_email)
    AND success = false
    AND created_at > now() - interval '15 minutes';
  
  RETURN failure_count >= 5;
END;
$$;

-- Function to record a login attempt (for edge function use)
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  attempt_email text,
  attempt_ip text DEFAULT NULL,
  attempt_success boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip_address, success)
  VALUES (LOWER(attempt_email), attempt_ip, attempt_success);
  
  -- Cleanup old entries opportunistically
  PERFORM public.cleanup_old_login_attempts();
END;
$$;
