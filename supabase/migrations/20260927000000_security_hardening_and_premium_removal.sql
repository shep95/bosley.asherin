-- ============================================================================
-- Security hardening + subscription/premium removal
-- ----------------------------------------------------------------------------
-- Findings addressed (see README "Security"):
--  1. SECURITY DEFINER RPCs were executable by anon/authenticated → audit-log
--     spoofing (record_audit_event) and account-lockout DoS (record_login_attempt).
--  2. Several SELECT policies had no TO clause, so anon could enumerate reposts,
--     reactions, hashtags, events, lists, communities, polls, Q&A answers, and
--     public authors' profiles straight from the REST API (link/data scrapers).
--  3. Post authors could read who reported them (post_flags).
--  4. Stale profile_views policy let users log views of themselves.
--  5. Premium columns were client-writable (self-grant) — premium is removed.
--  6. Anonymous Q&A ignored the recipient's opt-out.
--  7. Sign-up with email confirmation had no session, so the client-side
--     profile insert failed → server-side trigger now creates the profile.
--  8. Storage buckets had no size/MIME limits.
-- Everything is idempotent so it can be re-run safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Privileged RPCs: service_role only
-- ---------------------------------------------------------------------------
-- Email+IP scoped lock: a remote attacker can no longer lock an arbitrary
-- account, because failures only count from the caller's own IP.
CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text, check_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_ip_failures integer;
  ip_failures integer;
BEGIN
  IF check_ip IS NULL OR check_ip = '' THEN
    -- No client IP available: fall back to the email-only rule but with a
    -- higher threshold so it cannot be used as a cheap lockout.
    SELECT COUNT(*) INTO email_ip_failures
      FROM public.login_attempts
     WHERE email = LOWER(check_email)
       AND success = false
       AND created_at > now() - interval '15 minutes';
    RETURN email_ip_failures >= 25;
  END IF;

  SELECT COUNT(*) INTO email_ip_failures
    FROM public.login_attempts
   WHERE email = LOWER(check_email)
     AND ip_address = check_ip
     AND success = false
     AND created_at > now() - interval '15 minutes';

  SELECT COUNT(*) INTO ip_failures
    FROM public.login_attempts
   WHERE ip_address = check_ip
     AND success = false
     AND created_at > now() - interval '15 minutes';

  RETURN email_ip_failures >= 5 OR ip_failures >= 30;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.record_audit_event(uuid, text, jsonb, text, text)',
    'public.record_login_attempt(text, text, boolean)',
    'public.is_account_locked(text)',
    'public.is_account_locked(text, text)',
    'public.cleanup_old_login_attempts()',
    'public.cleanup_expired_messages()'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skipping missing function %', fn;
    END;
  END LOOP;
END $$;

-- Membership/role oracles: authenticated only (they are used inside policies,
-- which evaluate as the table owner, so anon does not need direct EXECUTE).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.is_group_member(uuid, uuid)',
    'public.is_group_admin(uuid, uuid)',
    'public.is_group_owner(uuid, uuid)',
    'public.is_community_member(uuid, uuid)',
    'public.is_public_community(uuid)',
    'public.get_post_engagement(uuid[])'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skipping missing function %', fn;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Anti-scraping: anon gets no direct table access at all
-- ---------------------------------------------------------------------------
-- Every read the signed-out landing page needs goes through a capped RPC
-- (get_public_preview_posts, below). Sign-up pre-checks (is_username_taken,
-- is_email_domain_blocked) are SECURITY DEFINER and keep working.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DROP POLICY IF EXISTS "Anon can view profiles of public authors" ON public.profiles;
DROP POLICY IF EXISTS "Anon can view profiles for preview" ON public.profiles;

-- Belt and braces: any SELECT policy still addressed to PUBLIC on these tables
-- is narrowed to authenticated.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd = 'SELECT'
       AND roles = '{public}'::name[]
       AND tablename IN (
         'polls','poll_options','poll_votes','reposts','hashtags','post_hashtags',
         'post_reactions','events','event_rsvps','lists','list_members','communities',
         'community_members','community_notes','note_votes','anonymous_questions',
         'user_verifications','topics','follows','post_likes','comment_likes',
         'post_edits','post_collaborators','collections','profiles','profile_views'
       )
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Capped public preview for the signed-out landing pane. Fixed limit, no
-- offset, no filters → nothing to paginate or enumerate.
CREATE OR REPLACE FUNCTION public.get_public_preview_posts()
RETURNS TABLE (
  id uuid,
  content text,
  created_at timestamptz,
  media_urls text[],
  is_nsfw boolean,
  content_warning text,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  likes_count bigint,
  comments_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         LEFT(p.content, 1000) AS content,
         p.created_at,
         p.media_urls,
         COALESCE(p.is_nsfw, false) AS is_nsfw,
         p.content_warning,
         p.user_id,
         pr.username,
         pr.display_name,
         pr.avatar_url,
         (SELECT COUNT(*) FROM public.post_likes l WHERE l.post_id = p.id) AS likes_count,
         (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id) AS comments_count
    FROM public.posts p
    JOIN public.profiles pr ON pr.user_id = p.user_id
   WHERE COALESCE(p.visibility, 'public') = 'public'
     AND (p.expires_at IS NULL OR p.expires_at > now())
   ORDER BY p.created_at DESC
   LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.get_public_preview_posts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_preview_posts() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reporter anonymity
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Reporters and post owners and mods can view flags" ON public.post_flags;
DROP POLICY IF EXISTS "Reporters and mods can view flags" ON public.post_flags;
CREATE POLICY "Reporters and mods can view flags"
ON public.post_flags
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);

-- ---------------------------------------------------------------------------
-- 4. profile_views: one policy, no self-views
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can record views" ON public.profile_views;
DROP POLICY IF EXISTS "Users can record profile views" ON public.profile_views;
DROP POLICY IF EXISTS "Authenticated can record profile views" ON public.profile_views;
DROP POLICY IF EXISTS "Authenticated users can record profile views" ON public.profile_views;
CREATE POLICY "Authenticated users can record profile views"
ON public.profile_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = viewer_user_id AND auth.uid() <> profile_user_id);

-- ---------------------------------------------------------------------------
-- 5. Premium / subscription removal
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_premium;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS premium_expires_at;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS max_file_size_mb;
DROP TABLE IF EXISTS public.translation_usage;

-- The backgrounds bucket policy name implied a premium gate that never existed.
DROP POLICY IF EXISTS "Premium users can upload backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own background" ON storage.objects;
CREATE POLICY "Users can upload their own background"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'backgrounds' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- 6. Anonymous Q&A honours the recipient's opt-out
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'anonymous_questions' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.anonymous_questions', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Anyone signed in can ask if recipient allows it"
ON public.anonymous_questions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() <> recipient_user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.user_settings s
     WHERE s.user_id = recipient_user_id
       AND s.anonymous_qa_enabled = false
  )
);

-- ---------------------------------------------------------------------------
-- 7. Server-side profile creation on sign-up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
  candidate text;
BEGIN
  base_name := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g');
  IF base_name IS NULL OR length(base_name) < 3 THEN
    base_name := 'user' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  candidate := LEFT(base_name, 30);
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(candidate)) THEN
    candidate := LEFT(base_name, 22) || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, candidate, candidate)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block account creation because of a profile hiccup; the client
  -- retries the insert on first sign-in.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 8. Storage limits (server-side, matching the client constants)
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
   SET file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id = 'avatars';
UPDATE storage.buckets
   SET file_size_limit = 100 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm']
 WHERE id = 'post-media';
UPDATE storage.buckets
   SET file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id = 'backgrounds';
UPDATE storage.buckets
   SET file_size_limit = 25 * 1024 * 1024
 WHERE id = 'files';

-- ---------------------------------------------------------------------------
-- 9. Notifications are generated server-side, never inserted by clients
-- ---------------------------------------------------------------------------
-- Before: any signed-in user could insert unlimited "X liked your post" rows
-- for any target user (spam vector). Now triggers on the real events create
-- them and the client INSERT policy is closed.
-- The original CHECK only allowed like/comment/follow/mention; the triggers
-- below also emit 'repost' and 'reply', so widen it first.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'reply', 'follow', 'mention', 'repost'));

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (owner, NEW.user_id, 'repost', NEW.post_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid; parent_owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
    VALUES (owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_owner FROM public.comments WHERE id = NEW.parent_id;
    IF parent_owner IS NOT NULL AND parent_owner <> NEW.user_id AND parent_owner IS DISTINCT FROM owner THEN
      INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
      VALUES (parent_owner, NEW.user_id, 'reply', NEW.post_id, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.following_id <> NEW.follower_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NEW;
END $$;

-- @mentions in posts and comments: one notification per mentioned user, capped
-- at 10 per item so a single post cannot fan out into a spam burst.
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  handle text;
  target uuid;
  n integer := 0;
  post_ref uuid;
  comment_ref uuid;
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    post_ref := NEW.id; comment_ref := NULL;
  ELSE
    post_ref := NEW.post_id; comment_ref := NEW.id;
  END IF;
  FOR handle IN
    SELECT DISTINCT lower(m[1]) FROM regexp_matches(COALESCE(NEW.content, ''), '(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})', 'g') AS m
  LOOP
    EXIT WHEN n >= 10;
    SELECT user_id INTO target FROM public.profiles WHERE lower(username) = handle;
    IF target IS NOT NULL AND target <> NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
      VALUES (target, NEW.user_id, 'mention', post_ref, comment_ref);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();

DROP TRIGGER IF EXISTS trg_notify_repost ON public.reposts;
CREATE TRIGGER trg_notify_repost AFTER INSERT ON public.reposts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();

DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

DROP TRIGGER IF EXISTS trg_notify_mention_post ON public.posts;
CREATE TRIGGER trg_notify_mention_post AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_mention();

DROP TRIGGER IF EXISTS trg_notify_mention_comment ON public.comments;
CREATE TRIGGER trg_notify_mention_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_mention();

-- Close the client-side INSERT path.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Notifications are created by triggers only"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Housekeeping: notifications older than 90 days are noise. Callable by the
-- service role (cron) only.
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;
