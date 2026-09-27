
-- Add disappearing message support to messages table
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_view_once boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz DEFAULT NULL;

-- Add privacy control columns to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS read_receipts_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_seen_visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_status_visible boolean DEFAULT true;

-- Per-contact privacy overrides
CREATE TABLE IF NOT EXISTS public.contact_privacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_user_id uuid NOT NULL,
  read_receipts boolean DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_user_id)
);

ALTER TABLE public.contact_privacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own contact privacy"
ON public.contact_privacy FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit log"
ON public.audit_log FOR SELECT
USING (auth.uid() = user_id);

-- Only edge functions/service role can insert audit logs
CREATE POLICY "No direct client insert to audit log"
ON public.audit_log FOR INSERT
WITH CHECK (false);

-- Index for fast audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_time ON public.audit_log (user_id, created_at DESC);

-- Index for expired messages cleanup
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON public.messages (expires_at) WHERE expires_at IS NOT NULL;

-- Function to clean up expired messages
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages 
  WHERE expires_at IS NOT NULL AND expires_at < now();
  
  -- Also delete view-once messages that have been viewed
  DELETE FROM public.messages
  WHERE is_view_once = true AND viewed_at IS NOT NULL 
    AND viewed_at < now() - interval '5 seconds';
END;
$$;

-- Function to record audit events (for service role)
CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_user_id uuid,
  p_action text,
  p_details jsonb DEFAULT '{}',
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, details, ip_address, user_agent)
  VALUES (p_user_id, p_action, p_details, p_ip, p_user_agent);
END;
$$;
