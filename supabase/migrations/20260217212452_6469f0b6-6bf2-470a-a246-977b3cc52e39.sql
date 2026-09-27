
-- COMPLETE BATCH: All new tables and columns

-- 1. USER ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. REPOSTS
CREATE TABLE public.reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, post_id)
);
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view reposts" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "Users can repost" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unrepost" ON public.reposts FOR DELETE USING (auth.uid() = user_id);

-- 3. QUOTE POSTS
ALTER TABLE public.posts ADD COLUMN quoted_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;

-- 4. HASHTAGS
CREATE TABLE public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  post_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view hashtags" ON public.hashtags FOR SELECT USING (true);

CREATE TABLE public.post_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  hashtag_id uuid REFERENCES public.hashtags(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (post_id, hashtag_id)
);
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view post hashtags" ON public.post_hashtags FOR SELECT USING (true);
CREATE POLICY "Post owners can create post hashtags" ON public.post_hashtags FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_hashtags.post_id AND user_id = auth.uid())
);
CREATE POLICY "Post owners can delete post hashtags" ON public.post_hashtags FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_hashtags.post_id AND user_id = auth.uid())
);

CREATE TABLE public.hashtag_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  hashtag_id uuid REFERENCES public.hashtags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, hashtag_id)
);
ALTER TABLE public.hashtag_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their hashtag follows" ON public.hashtag_follows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can follow hashtags" ON public.hashtag_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfollow hashtags" ON public.hashtag_follows FOR DELETE USING (auth.uid() = user_id);

-- 5. EXTENDED REACTIONS
CREATE TABLE public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'laugh', 'insightful', 'support', 'disagree')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (post_id, user_id, reaction_type)
);
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view reactions" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "Users can react" ON public.post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unreact" ON public.post_reactions FOR DELETE USING (auth.uid() = user_id);

-- 6. LISTS
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  name text NOT NULL, description text, is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public lists visible to authenticated" ON public.lists FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users can create lists" ON public.lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their lists" ON public.lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their lists" ON public.lists FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
  member_user_id uuid NOT NULL, added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, member_user_id)
);
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "List members visible if list accessible" ON public.list_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lists WHERE id = list_members.list_id AND (is_public = true OR user_id = auth.uid()))
);
CREATE POLICY "List owners can add members" ON public.list_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.lists WHERE id = list_members.list_id AND user_id = auth.uid())
);
CREATE POLICY "List owners can remove members" ON public.list_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.lists WHERE id = list_members.list_id AND user_id = auth.uid())
);

CREATE TABLE public.list_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  list_id uuid REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, list_id)
);
ALTER TABLE public.list_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their list subscriptions" ON public.list_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can subscribe to public lists" ON public.list_subscriptions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.lists WHERE id = list_subscriptions.list_id AND is_public = true)
);
CREATE POLICY "Users can unsubscribe" ON public.list_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 7. VERIFICATION
CREATE TABLE public.user_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
  verification_type text NOT NULL CHECK (verification_type IN ('individual', 'organization', 'bot', 'developer')),
  verified_at timestamptz NOT NULL DEFAULT now(), verified_by uuid,
  verification_method text, is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view verifications" ON public.user_verifications FOR SELECT USING (true);
CREATE POLICY "Admins can manage verifications" ON public.user_verifications FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 8. COMMUNITIES (create members table first, then communities, then add FK)
CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(), UNIQUE (community_id, user_id)
);

CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  description text, rules text, icon_url text, banner_url text, created_by uuid NOT NULL,
  is_private boolean NOT NULL DEFAULT false, is_nsfw boolean NOT NULL DEFAULT false,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_members ADD CONSTRAINT community_members_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public communities visible" ON public.communities FOR SELECT USING (
  is_private = false OR EXISTS (SELECT 1 FROM public.community_members WHERE community_id = communities.id AND user_id = auth.uid())
);
CREATE POLICY "Users can create communities" ON public.communities FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Community creators can update" ON public.communities FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Community creators can delete" ON public.communities FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "Members can view community members" ON public.community_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = community_members.community_id AND cm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_members.community_id AND c.is_private = false)
);
CREATE POLICY "Users can join public communities" ON public.community_members FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.communities WHERE id = community_members.community_id AND is_private = false)
);
CREATE POLICY "Users can leave communities" ON public.community_members FOR DELETE USING (auth.uid() = user_id);

-- 9. EVENTS
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text,
  location text, virtual_url text, starts_at timestamptz NOT NULL, ends_at timestamptz,
  created_by uuid NOT NULL, community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  cover_url text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Users can create events" ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update events" ON public.events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete events" ON public.events FOR DELETE USING (auth.uid() = created_by);

CREATE TABLE public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL, status text NOT NULL DEFAULT 'interested' CHECK (status IN ('going', 'interested', 'not_going')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (event_id, user_id)
);
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view RSVPs" ON public.event_rsvps FOR SELECT USING (true);
CREATE POLICY "Users can RSVP" ON public.event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their RSVP" ON public.event_rsvps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove their RSVP" ON public.event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- 10. MUTES
CREATE TABLE public.mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  muted_user_id uuid NOT NULL, mute_retweets boolean NOT NULL DEFAULT true,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, muted_user_id)
);
ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own mutes" ON public.mutes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11. SAVED SEARCHES
CREATE TABLE public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  query text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, query)
);
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own saved searches" ON public.saved_searches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 12. POST DRAFTS
CREATE TABLE public.post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '', media_urls text[] DEFAULT '{}',
  is_thread boolean NOT NULL DEFAULT false, thread_posts jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own drafts" ON public.post_drafts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 13. POST TEMPLATES
CREATE TABLE public.post_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  name text NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.post_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own templates" ON public.post_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 14. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS pinned_post_ids uuid[] DEFAULT '{}';

-- 15. Post additions
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_warning text,
  ADD COLUMN IF NOT EXISTS is_nsfw boolean DEFAULT false;

-- 16. Enhanced reports
ALTER TABLE public.post_flags
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_taken text;

-- 17. MODERATION ACTIONS
CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), moderator_id uuid NOT NULL,
  target_user_id uuid, target_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('ban', 'shadowban', 'timeout', 'warn', 'content_removal', 'unban')),
  reason text, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and moderators can view" ON public.moderation_actions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins and moderators can create" ON public.moderation_actions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- 18. USER PREFERENCES (accessibility)
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
  font_size text DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large', 'xlarge')),
  dyslexia_font boolean DEFAULT false, high_contrast boolean DEFAULT false,
  reduce_motion boolean DEFAULT false,
  color_blind_mode text DEFAULT 'none' CHECK (color_blind_mode IN ('none', 'protanopia', 'deuteranopia', 'tritanopia')),
  amoled_dark boolean DEFAULT false,
  layout_mode text DEFAULT 'single' CHECK (layout_mode IN ('single', 'multi', 'compact', 'expanded')),
  sidebar_position text DEFAULT 'left' CHECK (sidebar_position IN ('left', 'right')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own preferences" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reposts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_members;
