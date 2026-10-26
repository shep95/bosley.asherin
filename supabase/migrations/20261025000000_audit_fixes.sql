-- ============================================================================
-- Audit fixes (25 Oct 2026). Every item below was a confirmed defect.
--  1. Message receivers could rewrite any column (content, sender_id) of a
--     message they received. Now only read/seen/viewed timestamps may change.
--  2. Read receipts: a receiver with receipts off still published read_at.
--     seen_at is the receiver's private "I have opened it"; read_at is only
--     filled when the receiver's receipts are on (per-contact override first).
--  3. Circle posts were visible to their author only (client wrote 'circles',
--     policy expected 'circle', and circle_members RLS hid membership).
--  4. Poll totals were computed from rows the viewer can see (their own vote)
--     so every voter saw "1 vote, 100%". get_poll_results returns real counts.
--     Voters can now change their vote in place (UPDATE policy).
--  5. reply_control 'mutuals' fell through to "closed".
--  6. Feed stats: one RPC returns likes, comments, reposts and the viewer's
--     own liked / reposted / bookmarked flags for a page of posts.
--  7. Messages: conversation list and requests are computed in the database
--     (latest message per partner, unread counts, request flag), replacing a
--     500-row client scan and an unbounded requests query.
--  8. One RPC for every badge count.
--  9. View-once and disappearing messages are enforced by a scheduled job;
--     scheduled posts are published by a scheduled job; old notifications and
--     login attempts are pruned.
-- 10. Trigram indexes so search does not scan whole tables.
-- 11. Member numbers: a permanent, ordered identity for every account.
-- Everything is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 + 2. messages: column-locked updates and private read state
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at timestamptz;
UPDATE public.messages SET seen_at = read_at WHERE seen_at IS NULL AND read_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unseen
  ON public.messages (receiver_id, created_at DESC) WHERE seen_at IS NULL;

CREATE TABLE IF NOT EXISTS public.dm_accepts (
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);
ALTER TABLE public.dm_accepts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own accepted requests" ON public.dm_accepts;
CREATE POLICY "Users manage their own accepted requests"
ON public.dm_accepts FOR ALL TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);
GRANT SELECT, INSERT, DELETE ON public.dm_accepts TO authenticated;

CREATE OR REPLACE FUNCTION public.receipts_enabled(_receiver uuid, _sender uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT cp.read_receipts FROM public.contact_privacy cp
      WHERE cp.user_id = _receiver AND cp.contact_user_id = _sender),
    (SELECT s.read_receipts_enabled FROM public.user_settings s WHERE s.user_id = _receiver),
    true
  );
$$;
REVOKE ALL ON FUNCTION public.receipts_enabled(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.is_view_once IS DISTINCT FROM OLD.is_view_once THEN
    RAISE EXCEPTION 'only read state can change on a message' USING ERRCODE = '42501';
  END IF;
  -- Timestamps only move forward from NULL; nobody can un-read or re-date.
  IF OLD.seen_at IS NOT NULL THEN NEW.seen_at := OLD.seen_at; END IF;
  IF OLD.viewed_at IS NOT NULL THEN NEW.viewed_at := OLD.viewed_at; END IF;
  IF NEW.read_at IS NOT NULL AND NEW.seen_at IS NULL THEN NEW.seen_at := NEW.read_at; END IF;
  IF OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
  ELSIF NEW.read_at IS NOT NULL AND NOT public.receipts_enabled(NEW.receiver_id, NEW.sender_id) THEN
    NEW.read_at := NULL; -- seen privately, not published to the sender
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_message_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_message_update ON public.messages;
CREATE TRIGGER trg_guard_message_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

-- ---------------------------------------------------------------------------
-- 3. circle visibility
-- ---------------------------------------------------------------------------
UPDATE public.posts SET visibility = 'circle' WHERE visibility = 'circles';
UPDATE public.scheduled_posts SET visibility = 'circle' WHERE visibility = 'circles';

CREATE OR REPLACE FUNCTION public.is_circle_member(_circle_ids uuid[], _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _circle_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.circle_members cm
     WHERE cm.member_user_id = _user_id AND cm.circle_id = ANY(_circle_ids)
  );
$$;
REVOKE ALL ON FUNCTION public.is_circle_member(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_circle_member(uuid[], uuid) TO authenticated, service_role;

-- Single definition of "may this user see this post", shared by RLS and RPCs.
CREATE OR REPLACE FUNCTION public.can_view_post(_post_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
     WHERE p.id = _post_id
       AND (
         p.user_id = _user_id
         OR COALESCE(p.visibility, 'public') = 'public'
         OR (p.visibility = 'followers' AND EXISTS (
               SELECT 1 FROM public.follows f WHERE f.follower_id = _user_id AND f.following_id = p.user_id))
         OR (p.visibility = 'mutuals'
             AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = _user_id AND f.following_id = p.user_id)
             AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.user_id AND f.following_id = _user_id))
         OR (p.visibility IN ('circle', 'circles') AND public.is_circle_member(p.circle_ids, _user_id))
       )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_post(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_post(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Posts viewable based on visibility" ON public.posts;
CREATE POLICY "Posts viewable based on visibility"
ON public.posts FOR SELECT TO authenticated
USING (
  (select auth.uid()) = user_id
  OR COALESCE(visibility, 'public') = 'public'
  OR (visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows f WHERE f.follower_id = (select auth.uid()) AND f.following_id = posts.user_id))
  OR (visibility = 'mutuals'
      AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = (select auth.uid()) AND f.following_id = posts.user_id)
      AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = posts.user_id AND f.following_id = (select auth.uid())))
  OR (visibility IN ('circle', 'circles') AND public.is_circle_member(circle_ids, (select auth.uid())))
);

-- ---------------------------------------------------------------------------
-- 4. polls
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_poll_results(_post_id uuid)
RETURNS TABLE (
  poll_id uuid, question text, ends_at timestamptz,
  option_id uuid, option_text text, "position" integer,
  votes bigint, total_votes bigint, my_option_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pl AS (
    SELECT p.* FROM public.polls p
     WHERE p.post_id = _post_id
       AND public.can_view_post(_post_id, auth.uid())
     LIMIT 1
  ), counts AS (
    SELECT v.option_id, count(*) AS n FROM public.poll_votes v JOIN pl ON v.poll_id = pl.id GROUP BY v.option_id
  )
  SELECT pl.id, pl.question, pl.ends_at,
         o.id, o.option_text, o.position,
         COALESCE(c.n, 0),
         (SELECT COALESCE(sum(n), 0) FROM counts)::bigint,
         (SELECT v.option_id FROM public.poll_votes v WHERE v.poll_id = pl.id AND v.user_id = auth.uid() LIMIT 1)
    FROM pl
    JOIN public.poll_options o ON o.poll_id = pl.id
    LEFT JOIN counts c ON c.option_id = o.id
   ORDER BY o.position;
$$;
REVOKE ALL ON FUNCTION public.get_poll_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_poll_results(uuid) TO authenticated, service_role;

-- Change a vote in place (the unique (poll_id, user_id) index makes
-- delete+insert racy); voting is closed once the poll has ended.
DROP POLICY IF EXISTS "Users can change their vote" ON public.poll_votes;
CREATE POLICY "Users can change their vote"
ON public.poll_votes FOR UPDATE TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.guard_poll_vote()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE pl record;
BEGIN
  SELECT * INTO pl FROM public.polls WHERE id = NEW.poll_id;
  IF pl.id IS NULL THEN
    RAISE EXCEPTION 'poll not found' USING ERRCODE = 'P0002';
  END IF;
  IF pl.ends_at IS NOT NULL AND pl.ends_at < now() THEN
    RAISE EXCEPTION 'this poll has closed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poll_options o WHERE o.id = NEW.option_id AND o.poll_id = NEW.poll_id) THEN
    RAISE EXCEPTION 'that option is not part of this poll' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_view_post(pl.post_id, NEW.user_id) THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_poll_vote() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_poll_vote ON public.poll_votes;
CREATE TRIGGER trg_guard_poll_vote
BEFORE INSERT OR UPDATE ON public.poll_votes
FOR EACH ROW EXECUTE FUNCTION public.guard_poll_vote();

-- ---------------------------------------------------------------------------
-- 5. reply controls: add 'mutuals'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_reply_controls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  commenter_username text;
  commenter_since timestamptz;
  follower_count integer;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, content, reply_control, min_account_age_days, min_follower_count
    INTO p FROM public.posts WHERE id = NEW.post_id;
  IF p.user_id IS NULL THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;
  IF p.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mutes m
     WHERE m.user_id = p.user_id AND m.muted_user_id = NEW.user_id
       AND (m.expires_at IS NULL OR m.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'replies from this account are not accepted' USING ERRCODE = '42501';
  END IF;

  CASE COALESCE(p.reply_control, 'everyone')
    WHEN 'everyone' THEN NULL;
    WHEN 'followers' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.follows f
         WHERE f.follower_id = NEW.user_id AND f.following_id = p.user_id
      ) THEN
        RAISE EXCEPTION 'only followers can reply to this post' USING ERRCODE = '42501';
      END IF;
    WHEN 'following' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.follows f
         WHERE f.follower_id = p.user_id AND f.following_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'only people the author follows can reply' USING ERRCODE = '42501';
      END IF;
    WHEN 'mutuals' THEN
      IF NOT (
        EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = NEW.user_id AND f.following_id = p.user_id)
        AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.user_id AND f.following_id = NEW.user_id)
      ) THEN
        RAISE EXCEPTION 'only mutuals can reply to this post' USING ERRCODE = '42501';
      END IF;
    WHEN 'mentioned' THEN
      SELECT username INTO commenter_username FROM public.profiles WHERE user_id = NEW.user_id;
      IF commenter_username IS NULL
         OR position(('@' || lower(commenter_username)) IN lower(COALESCE(p.content, ''))) = 0 THEN
        RAISE EXCEPTION 'only mentioned people can reply to this post' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'replies are closed on this post' USING ERRCODE = '42501';
  END CASE;

  IF COALESCE(p.min_account_age_days, 0) > 0 THEN
    SELECT created_at INTO commenter_since FROM public.profiles WHERE user_id = NEW.user_id;
    IF commenter_since IS NULL OR commenter_since > now() - make_interval(days => p.min_account_age_days) THEN
      RAISE EXCEPTION 'this post requires an older account to reply' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF COALESCE(p.min_follower_count, 0) > 0 THEN
    SELECT count(*) INTO follower_count FROM public.follows WHERE following_id = NEW.user_id;
    IF follower_count < p.min_follower_count THEN
      RAISE EXCEPTION 'this post requires more followers to reply' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_reply_controls() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. feed stats for a page of posts (RLS applies: SECURITY INVOKER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_post_stats(post_ids uuid[])
RETURNS TABLE (
  post_id uuid, likes_count bigint, comments_count bigint, reposts_count bigint,
  liked boolean, reposted boolean, bookmarked boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT p.id,
         (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id),
         (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id),
         (SELECT count(*) FROM public.reposts r WHERE r.post_id = p.id),
         EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = (select auth.uid())),
         EXISTS (SELECT 1 FROM public.reposts r WHERE r.post_id = p.id AND r.user_id = (select auth.uid())),
         EXISTS (SELECT 1 FROM public.bookmarks b WHERE b.post_id = p.id AND b.user_id = (select auth.uid()))
    FROM public.posts p
   WHERE p.id = ANY(post_ids)
$$;
REVOKE ALL ON FUNCTION public.get_post_stats(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_stats(uuid[]) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON public.reposts (post_id);

-- ---------------------------------------------------------------------------
-- 7. conversations and requests, computed server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_conversations()
RETURNS TABLE (
  partner_id uuid, username text, display_name text, avatar_url text,
  last_message_id uuid, last_message text, last_message_at timestamptz,
  last_from_me boolean, unread_count bigint, is_request boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH me AS (SELECT (select auth.uid()) AS id),
  live AS (
    SELECT m.*,
           CASE WHEN m.sender_id = (SELECT id FROM me) THEN m.receiver_id ELSE m.sender_id END AS partner
      FROM public.messages m
     WHERE (m.sender_id = (SELECT id FROM me) OR m.receiver_id = (SELECT id FROM me))
       AND (m.expires_at IS NULL OR m.expires_at > now())
       AND NOT (m.is_view_once AND m.viewed_at IS NOT NULL AND m.receiver_id = (SELECT id FROM me))
  ),
  latest AS (
    SELECT DISTINCT ON (partner) * FROM live ORDER BY partner, created_at DESC
  )
  SELECT l.partner, pr.username, pr.display_name, pr.avatar_url,
         l.id,
         CASE WHEN l.is_view_once THEN 'view-once message' ELSE left(l.content, 140) END,
         l.created_at,
         l.sender_id = (SELECT id FROM me),
         (SELECT count(*) FROM live u WHERE u.partner = l.partner AND u.receiver_id = (SELECT id FROM me) AND u.seen_at IS NULL),
         NOT EXISTS (SELECT 1 FROM live s WHERE s.partner = l.partner AND s.sender_id = (SELECT id FROM me))
           AND NOT EXISTS (SELECT 1 FROM public.dm_accepts a WHERE a.user_id = (SELECT id FROM me) AND a.partner_id = l.partner)
    FROM latest l
    LEFT JOIN public.profiles pr ON pr.user_id = l.partner
   ORDER BY l.created_at DESC
   LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.get_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversations() TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver_created ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender_created ON public.messages (receiver_id, sender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. every badge count in one round trip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE (messages bigint, requests bigint, notifications bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH c AS (SELECT * FROM public.get_conversations())
  SELECT COALESCE((SELECT sum(unread_count) FROM c WHERE NOT is_request), 0)::bigint,
         (SELECT count(*) FROM c WHERE is_request AND unread_count > 0),
         (SELECT count(*) FROM public.notifications n WHERE n.user_id = (select auth.uid()) AND NOT n.read);
$$;
REVOKE ALL ON FUNCTION public.get_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_counts() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. scheduled jobs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_posts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_posts
     WHERE status = 'pending' AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.posts (user_id, content, media_urls, visibility, circle_ids, expires_at)
      VALUES (r.user_id, r.content, COALESCE(r.media_urls, '{}'),
              CASE WHEN r.visibility = 'circles' THEN 'circle' ELSE COALESCE(r.visibility, 'public') END,
              COALESCE(r.circle_ids, '{}'), r.expires_at);
      UPDATE public.scheduled_posts SET status = 'published', published_at = now() WHERE id = r.id;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Leave it pending only if the failure is transient; a content or rate
      -- error would repeat forever, so mark it cancelled instead.
      UPDATE public.scheduled_posts SET status = 'cancelled' WHERE id = r.id;
      RAISE WARNING 'scheduled post % not published: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.publish_due_scheduled_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_posts() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at < now();
  DELETE FROM public.messages
   WHERE is_view_once = true AND viewed_at IS NOT NULL AND viewed_at < now() - interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('bosley-publish-scheduled', 'bosley-expire-messages', 'bosley-prune-notifications', 'bosley-prune-login-attempts');
  PERFORM cron.schedule('bosley-publish-scheduled', '* * * * *', 'SELECT public.publish_due_scheduled_posts()');
  PERFORM cron.schedule('bosley-expire-messages', '* * * * *', 'SELECT public.cleanup_expired_messages()');
  PERFORM cron.schedule('bosley-prune-notifications', '17 3 * * *', 'SELECT public.cleanup_old_notifications()');
  PERFORM cron.schedule('bosley-prune-login-attempts', '7 * * * *', 'SELECT public.cleanup_old_login_attempts()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available here (%); schedule these jobs from the dashboard', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 10. search indexes
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON public.posts USING gin (content extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin (username extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON public.profiles USING gin (display_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 11. member numbers (permanent, ordered by join time)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.member_number_seq;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_number bigint;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE member_number IS NULL ORDER BY created_at, id LOOP
    UPDATE public.profiles SET member_number = nextval('public.member_number_seq') WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.profiles ALTER COLUMN member_number DROP DEFAULT; -- assigned by trg_guard_member_number
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_member_number ON public.profiles (member_number);
GRANT USAGE, SELECT ON SEQUENCE public.member_number_seq TO authenticated, service_role;

-- Nobody edits their own member number.
CREATE OR REPLACE FUNCTION public.guard_member_number()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.member_number IS DISTINCT FROM OLD.member_number
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    NEW.member_number := OLD.member_number;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.member_number IS NULL OR COALESCE(auth.role(), '') <> 'service_role') THEN
    NEW.member_number := nextval('public.member_number_seq');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_member_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_member_number ON public.profiles;
CREATE TRIGGER trg_guard_member_number
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_member_number();

-- ---------------------------------------------------------------------------
-- 12. Two-factor is enforced by the database, not only the browser.
--     A session that has not completed its TOTP step (aal1) for an account
--     with a verified factor gets nothing from any table or bucket.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
         WHERE f.user_id = auth.uid() AND f.status = 'verified'
      );
$$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require completed two-factor" ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY "Require completed two-factor" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.mfa_satisfied())) WITH CHECK ((select public.mfa_satisfied()))',
      r.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Require completed two-factor" ON storage.objects;
CREATE POLICY "Require completed two-factor" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((select public.mfa_satisfied())) WITH CHECK ((select public.mfa_satisfied()));

-- ---------------------------------------------------------------------------
-- 13. Recipient preferences that the sender cannot read under RLS
--     ("message requests off", mutes, Q&A off) were silently ignored because
--     the policies read the recipient's private rows as the sender.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accepts_message_from(_receiver uuid, _sender uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _receiver <> _sender
     AND NOT EXISTS (
       SELECT 1 FROM public.mutes m
        WHERE m.user_id = _receiver AND m.muted_user_id = _sender
          AND (m.expires_at IS NULL OR m.expires_at > now()))
     AND (
       COALESCE((SELECT s.message_requests_enabled FROM public.user_settings s WHERE s.user_id = _receiver), true)
       OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = _receiver AND f.following_id = _sender)
       OR EXISTS (SELECT 1 FROM public.messages m WHERE m.sender_id = _receiver AND m.receiver_id = _sender)
       OR EXISTS (SELECT 1 FROM public.dm_accepts a WHERE a.user_id = _receiver AND a.partner_id = _sender)
     );
$$;
REVOKE ALL ON FUNCTION public.accepts_message_from(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accepts_message_from(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can send messages to people who accept them" ON public.messages;
CREATE POLICY "Users can send messages to people who accept them"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) = sender_id
  AND public.accepts_message_from(receiver_id, sender_id)
);

CREATE OR REPLACE FUNCTION public.accepts_questions(_recipient uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT s.anonymous_qa_enabled FROM public.user_settings s WHERE s.user_id = _recipient), true);
$$;
REVOKE ALL ON FUNCTION public.accepts_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accepts_questions(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Anyone signed in can ask if recipient allows it" ON public.anonymous_questions;
CREATE POLICY "Anyone signed in can ask if recipient allows it"
ON public.anonymous_questions FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND (select auth.uid()) <> recipient_user_id
  AND public.accepts_questions(recipient_user_id)
);

-- Stealth mode also lived in a row the viewer could read (their own), so it
-- worked; the "already viewed this hour" check did not (viewers cannot read
-- their own view rows). One RPC records at most one view per hour.
CREATE OR REPLACE FUNCTION public.record_profile_view(_profile_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR me = _profile_user OR NOT public.mfa_satisfied() THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.user_settings s WHERE s.user_id = me AND s.stealth_mode) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profile_views v
     WHERE v.viewer_user_id = me AND v.profile_user_id = _profile_user
       AND v.viewed_at > now() - interval '1 hour'
  ) THEN RETURN; END IF;
  INSERT INTO public.profile_views (profile_user_id, viewer_user_id) VALUES (_profile_user, me);
END $$;
REVOKE ALL ON FUNCTION public.record_profile_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_profile_view(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Communities: real member counts; nobody joins as owner/moderator.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can join public communities" ON public.community_members;
CREATE POLICY "Users can join public communities"
ON public.community_members FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND (
    (role = 'member' AND public.is_public_community(community_id))
    OR (role = 'owner' AND EXISTS (
          SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.created_by = (select auth.uid())))
  )
);

CREATE OR REPLACE FUNCTION public.sync_community_member_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.communities c
     SET member_count = (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id)
   WHERE c.id = COALESCE(NEW.community_id, OLD.community_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_community_member_count() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_community_member_count ON public.community_members;
CREATE TRIGGER trg_sync_community_member_count
AFTER INSERT OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.sync_community_member_count();
UPDATE public.communities c
   SET member_count = (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id);

-- ---------------------------------------------------------------------------
-- 15. delete_my_account: Supabase Storage now refuses direct DELETEs on
--     storage.objects (protect_objects_delete), which rolled back the whole
--     deletion. Files are removed by the client through the Storage API
--     before this runs; the function removes rows and the auth identity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.mfa_satisfied() THEN
    RAISE EXCEPTION 'finish two-factor first' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.data_type = 'uuid'
       AND c.column_name IN (
         'user_id','sender_id','receiver_id','actor_id','follower_id','following_id',
         'viewer_user_id','profile_user_id','member_user_id','recipient_user_id',
         'muted_user_id','created_by','author_id','owner_id','added_by','invited_by','partner_id'
       )
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING uid;
  END LOOP;

  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
