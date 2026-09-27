-- Hard length caps as defense-in-depth (validation triggers already exist
-- with stricter business rules; these CHECKs guarantee an absolute ceiling
-- that cannot be bypassed via direct REST API calls).
ALTER TABLE public.posts
  ADD CONSTRAINT posts_content_max_len CHECK (char_length(content) <= 25000);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_content_max_len CHECK (char_length(content) <= 500);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_max_len CHECK (char_length(content) <= 4000);

-- Per-user translation rate limiting
CREATE TABLE public.translation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_translation_usage_user_time
  ON public.translation_usage (user_id, created_at DESC);

ALTER TABLE public.translation_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own translation usage"
  ON public.translation_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- INSERTs are performed by the edge function using the service role key,
-- which bypasses RLS; no INSERT policy is needed for end users.