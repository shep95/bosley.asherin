
-- =====================================================
-- FEED PROFILES: Saved timeline configurations
-- =====================================================
CREATE TABLE public.feed_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own feed profiles"
ON public.feed_profiles FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- BLOCK RULES: Advanced pattern blocking
-- =====================================================
CREATE TABLE public.block_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rule_type text NOT NULL, -- 'account_age', 'follower_count', 'keyword', 'following_count', 'temp_mute'
  rule_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.block_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own block rules"
ON public.block_rules FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_block_rules_user ON public.block_rules (user_id, is_active);

-- =====================================================
-- REPLY CONTROLS: Per-post conversation quality
-- =====================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reply_control text DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS slow_mode_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_account_age_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_follower_count integer DEFAULT 0;

-- =====================================================
-- BOOKMARK ENHANCEMENTS: Tags, search, expiry
-- =====================================================
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

CREATE INDEX idx_bookmarks_tags ON public.bookmarks USING GIN(tags);
CREATE INDEX idx_bookmarks_expires ON public.bookmarks (expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- KEYWORD FILTERS: Content filtering rules
-- =====================================================
CREATE TABLE public.keyword_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern text NOT NULL,
  scope text NOT NULL DEFAULT 'timeline', -- 'timeline', 'replies', 'notifications', 'all'
  is_regex boolean DEFAULT false,
  is_active boolean DEFAULT true,
  expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keyword_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own keyword filters"
ON public.keyword_filters FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- COMMUNITY NOTES: Crowd-sourced context
-- =====================================================
CREATE TABLE public.community_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  source_url text DEFAULT NULL,
  status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  helpful_count integer DEFAULT 0,
  not_helpful_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view approved notes"
ON public.community_notes FOR SELECT
USING (status = 'approved' OR auth.uid() = author_id);

CREATE POLICY "Authenticated can create notes"
ON public.community_notes FOR INSERT
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their notes"
ON public.community_notes FOR UPDATE
USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their notes"
ON public.community_notes FOR DELETE
USING (auth.uid() = author_id);

-- Note votes
CREATE TABLE public.note_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.community_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_helpful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(note_id, user_id)
);

ALTER TABLE public.note_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can vote on notes"
ON public.note_votes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
