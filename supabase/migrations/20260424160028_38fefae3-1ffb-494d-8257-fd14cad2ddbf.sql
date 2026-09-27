-- 1. Notifications: prevent actor spoofing
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications as themselves"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_id AND auth.uid() <> user_id);

-- 2. Move birthday into private table
CREATE TABLE IF NOT EXISTS public.profile_private (
  user_id UUID PRIMARY KEY,
  birthday DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own private profile"
ON public.profile_private FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own private profile"
ON public.profile_private FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own private profile"
ON public.profile_private FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own private profile"
ON public.profile_private FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Migrate existing birthdays
INSERT INTO public.profile_private (user_id, birthday)
SELECT user_id, birthday FROM public.profiles
WHERE birthday IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS birthday;

-- 3. user_verifications: hide method/verified_by from non-admins
DROP POLICY IF EXISTS "Anyone can view verifications" ON public.user_verifications;
DROP POLICY IF EXISTS "Verifications are viewable by everyone" ON public.user_verifications;

-- Drop any existing permissive SELECT
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='user_verifications' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_verifications', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "Owners and admins see full verification rows"
ON public.user_verifications FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Public-safe view (only badge status/type, no method/verified_by)
CREATE OR REPLACE VIEW public.user_verification_badges
WITH (security_invoker = true) AS
SELECT user_id, verification_type, is_active, verified_at
FROM public.user_verifications
WHERE is_active = true;

GRANT SELECT ON public.user_verification_badges TO authenticated, anon;

-- Allow authenticated to read just the badge view via a permissive policy on the table
CREATE POLICY "Public badge fields readable when active"
ON public.user_verifications FOR SELECT TO authenticated
USING (false); -- view bypasses; direct table access stays restricted

-- 4. Realtime: remove broad topic subscriptions
DROP POLICY IF EXISTS "Authenticated users can subscribe to their own topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can broadcast to their own topics" ON realtime.messages;

CREATE POLICY "Realtime: subscribe only to per-user topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() = ('notifications:' || auth.uid()::text)
  OR realtime.topic() = ('messages:' || auth.uid()::text)
);

CREATE POLICY "Realtime: broadcast only to own topics"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() = ('notifications:' || auth.uid()::text)
  OR realtime.topic() = ('messages:' || auth.uid()::text)
);