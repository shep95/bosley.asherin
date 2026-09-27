-- =============================================
-- PRIVACY & CONTROL + CREATOR TOOLS FEATURES
-- =============================================

-- 1. AUDIENCE CIRCLES - Create user-defined groups for post visibility
CREATE TABLE public.audience_circles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'users',
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Circle members
CREATE TABLE public.circle_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id UUID NOT NULL REFERENCES public.audience_circles(id) ON DELETE CASCADE,
    member_user_id UUID NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(circle_id, member_user_id)
);

-- 2. SCHEDULED POSTS - Posts with future publish times
CREATE TABLE public.scheduled_posts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    media_urls TEXT[] DEFAULT '{}',
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    circle_ids UUID[] DEFAULT '{}',
    visibility TEXT DEFAULT 'public',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    published_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'cancelled'))
);

-- 3. PROFILE VIEWS - Track who viewed profiles
CREATE TABLE public.profile_views (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_user_id UUID NOT NULL,
    viewer_user_id UUID NOT NULL,
    viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX idx_profile_views_profile ON public.profile_views(profile_user_id, viewed_at DESC);
CREATE INDEX idx_profile_views_viewer ON public.profile_views(viewer_user_id, viewed_at DESC);

-- 4. POLLS - Interactive engagement
CREATE TABLE public.polls (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    allows_multiple BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.poll_options (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.poll_votes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(poll_id, option_id, user_id)
);

-- 5. COLLABORATIVE POSTS - Co-authoring
CREATE TABLE public.post_collaborators (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    responded_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(post_id, user_id)
);

-- 6. Add stealth_mode to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN DEFAULT false;

-- 7. Add circle_ids to posts for audience targeting
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS circle_ids UUID[] DEFAULT '{}';

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Audience Circles RLS
ALTER TABLE public.audience_circles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own circles"
ON public.audience_circles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own circles"
ON public.audience_circles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own circles"
ON public.audience_circles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own circles"
ON public.audience_circles FOR DELETE
USING (auth.uid() = user_id);

-- Circle Members RLS
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Circle owners can view members"
ON public.circle_members FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.audience_circles c
    WHERE c.id = circle_id AND c.user_id = auth.uid()
));

CREATE POLICY "Circle owners can add members"
ON public.circle_members FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.audience_circles c
    WHERE c.id = circle_id AND c.user_id = auth.uid()
));

CREATE POLICY "Circle owners can remove members"
ON public.circle_members FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.audience_circles c
    WHERE c.id = circle_id AND c.user_id = auth.uid()
));

-- Scheduled Posts RLS
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their scheduled posts"
ON public.scheduled_posts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create scheduled posts"
ON public.scheduled_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their scheduled posts"
ON public.scheduled_posts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their scheduled posts"
ON public.scheduled_posts FOR DELETE
USING (auth.uid() = user_id);

-- Profile Views RLS
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see who viewed their profile"
ON public.profile_views FOR SELECT
USING (auth.uid() = profile_user_id);

CREATE POLICY "Authenticated users can record views"
ON public.profile_views FOR INSERT
WITH CHECK (auth.uid() = viewer_user_id AND auth.uid() != profile_user_id);

-- Polls RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view polls"
ON public.polls FOR SELECT
USING (true);

CREATE POLICY "Post owners can create polls"
ON public.polls FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.user_id = auth.uid()
));

CREATE POLICY "Post owners can update polls"
ON public.polls FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.user_id = auth.uid()
));

CREATE POLICY "Post owners can delete polls"
ON public.polls FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.user_id = auth.uid()
));

-- Poll Options RLS
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view poll options"
ON public.poll_options FOR SELECT
USING (true);

CREATE POLICY "Poll owners can create options"
ON public.poll_options FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls pl
    JOIN public.posts p ON p.id = pl.post_id
    WHERE pl.id = poll_id AND p.user_id = auth.uid()
));

CREATE POLICY "Poll owners can delete options"
ON public.poll_options FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.polls pl
    JOIN public.posts p ON p.id = pl.post_id
    WHERE pl.id = poll_id AND p.user_id = auth.uid()
));

-- Poll Votes RLS
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vote counts"
ON public.poll_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote on polls"
ON public.poll_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their votes"
ON public.poll_votes FOR DELETE
USING (auth.uid() = user_id);

-- Post Collaborators RLS
ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post owners and collaborators can view"
ON public.post_collaborators FOR SELECT
USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid())
);

CREATE POLICY "Post owners can invite collaborators"
ON public.post_collaborators FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.user_id = auth.uid()
));

CREATE POLICY "Collaborators can update their status"
ON public.post_collaborators FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Post owners can remove collaborators"
ON public.post_collaborators FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.user_id = auth.uid()
));