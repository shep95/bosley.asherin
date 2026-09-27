-- ============================================================================
-- Abuse resistance: everything an attacker can do by skipping the UI and
-- talking to PostgREST directly with a free account.
-- ----------------------------------------------------------------------------
--  1. Per-user write rate limits enforced in the database (spam floods).
--  2. Reply controls, minimum account age / follower count, and mutes were
--     client-side only → now enforced by trigger on comments.
--  3. Direct messages: muted senders and "message requests off" were not
--     enforced → now enforced in the INSERT policy.
--  4. Stealth mode was never enforced on profile_views.
--  5. There was no way to delete an account → delete_my_account() RPC that
--     removes the auth user, every row that references them, and their files.
--  6. Anonymous questions: cap per recipient so the channel cannot be flooded.
-- Everything is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Generic write rate limiter
-- ---------------------------------------------------------------------------
-- Trigger args: limit, window (interval text), user column.
-- The service role (edge functions, cron) is never limited.
CREATE OR REPLACE FUNCTION public.rate_limit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := TG_ARGV[0]::integer;
  win interval := TG_ARGV[1]::interval;
  col text := TG_ARGV[2];
  uid uuid;
  n integer;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT ($1).%I', col) INTO uid USING NEW;
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - $2',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, col
  ) INTO n USING uid, win;
  IF n >= lim THEN
    RAISE EXCEPTION 'rate limit exceeded: too many % in the last %', TG_TABLE_NAME, win
      USING ERRCODE = 'P0001', HINT = 'slow_down';
  END IF;
  RETURN NEW;
END $$;

-- Indexes so the counts stay cheap.
CREATE INDEX IF NOT EXISTS idx_comments_user_created ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_created ON public.group_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_created ON public.follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_created ON public.post_likes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user_created ON public.post_reactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_flags_user_created ON public.post_flags (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reposts_user_created ON public.reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anon_questions_recipient_created ON public.anonymous_questions (recipient_user_id, created_at DESC);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('posts',               'user_id',            '30',  '1 hour'),
      ('comments',            'user_id',            '60',  '1 hour'),
      ('messages',            'sender_id',          '120', '1 hour'),
      ('group_messages',      'sender_id',          '120', '1 hour'),
      ('follows',             'follower_id',        '100', '1 hour'),
      ('post_likes',          'user_id',            '300', '1 hour'),
      ('post_reactions',      'user_id',            '300', '1 hour'),
      ('reposts',             'user_id',            '60',  '1 hour'),
      ('post_flags',          'user_id',            '20',  '1 hour'),
      ('anonymous_questions', 'recipient_user_id',  '10',  '1 hour')
    ) AS t(tbl, col, lim, win)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_rate_limit ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rate_limit_guard(%L, %L, %L)',
      r.tbl, r.lim, r.win, r.col
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Reply controls enforced server-side
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
    RETURN NEW; -- authors can always reply to themselves
  END IF;

  -- The author muted this person: they do not get to reply.
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
    WHEN 'mentioned' THEN
      SELECT username INTO commenter_username FROM public.profiles WHERE user_id = NEW.user_id;
      IF commenter_username IS NULL
         OR position(('@' || lower(commenter_username)) IN lower(COALESCE(p.content, ''))) = 0 THEN
        RAISE EXCEPTION 'only mentioned people can reply to this post' USING ERRCODE = '42501';
      END IF;
    ELSE
      -- 'nobody', 'none', or anything unknown: closed.
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

DROP TRIGGER IF EXISTS trg_enforce_reply_controls ON public.comments;
CREATE TRIGGER trg_enforce_reply_controls
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_reply_controls();

-- ---------------------------------------------------------------------------
-- 3. Direct messages honour mutes and "message requests"
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Users can send messages to people who accept them"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND sender_id <> receiver_id
  -- receiver has not muted the sender
  AND NOT EXISTS (
    SELECT 1 FROM public.mutes m
     WHERE m.user_id = receiver_id AND m.muted_user_id = sender_id
       AND (m.expires_at IS NULL OR m.expires_at > now())
  )
  -- receiver accepts requests, or already follows the sender
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.user_settings s
       WHERE s.user_id = receiver_id AND s.message_requests_enabled = false
    )
    OR EXISTS (
      SELECT 1 FROM public.follows f
       WHERE f.follower_id = receiver_id AND f.following_id = sender_id
    )
  )
);

-- Recipients may mark messages read / viewed (previously impossible: no UPDATE policy).
DROP POLICY IF EXISTS "Receivers can mark messages read" ON public.messages;
CREATE POLICY "Receivers can mark messages read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

-- ---------------------------------------------------------------------------
-- 4. Stealth mode enforced on profile views
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can record profile views" ON public.profile_views;
CREATE POLICY "Authenticated users can record profile views"
ON public.profile_views
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = viewer_user_id
  AND auth.uid() <> profile_user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.user_settings s
     WHERE s.user_id = auth.uid() AND s.stealth_mode = true
  )
);

-- ---------------------------------------------------------------------------
-- 5. Account deletion
-- ---------------------------------------------------------------------------
-- Removes the auth user (cascades to profiles), then every row in public that
-- references the user through any of the known user columns, then their
-- storage objects. Runs as the definer so it can reach auth.users and storage.
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

  -- Rows that reference the user through any user-ish column.
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
         'muted_user_id','created_by','author_id','owner_id','added_by','invited_by'
       )
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING uid;
  END LOOP;

  -- Uploaded files live under <uid>/... in every bucket.
  DELETE FROM storage.objects WHERE (storage.foldername(name))[1] = uid::text;

  -- Finally the auth identity itself (profiles cascades from here).
  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Poll votes: one vote per poll per user (the old constraint allowed one
--    vote per OPTION, i.e. voting for every option at once).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_poll_votes_one_per_user'
  ) THEN
    -- Remove pre-existing multi-votes so the unique index can be created.
    DELETE FROM public.poll_votes pv
     USING public.poll_votes newer
     WHERE pv.poll_id = newer.poll_id AND pv.user_id = newer.user_id AND pv.created_at < newer.created_at;
    CREATE UNIQUE INDEX uq_poll_votes_one_per_user ON public.poll_votes (poll_id, user_id);
  END IF;
END $$;
