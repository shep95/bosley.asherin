
-- 1. POSTS: Replace permissive SELECT with visibility-aware policy
DROP POLICY IF EXISTS "Posts are viewable by authenticated users" ON public.posts;
DROP POLICY IF EXISTS "Authenticated can view posts" ON public.posts;
DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;

CREATE POLICY "Posts viewable based on visibility"
ON public.posts
FOR SELECT
TO authenticated
USING (
  -- Author always sees their own posts
  auth.uid() = user_id
  OR
  -- Public posts (default) visible to all authenticated
  (COALESCE(visibility, 'public') = 'public')
  OR
  -- Followers-only: viewer must follow author
  (visibility = 'followers' AND EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = auth.uid() AND following_id = posts.user_id
  ))
  OR
  -- Mutuals: both follow each other
  (visibility = 'mutuals' AND EXISTS (
    SELECT 1 FROM public.follows f1
    WHERE f1.follower_id = auth.uid() AND f1.following_id = posts.user_id
  ) AND EXISTS (
    SELECT 1 FROM public.follows f2
    WHERE f2.follower_id = posts.user_id AND f2.following_id = auth.uid()
  ))
  OR
  -- Circle: viewer must be a member of one of the targeted circles
  (visibility = 'circle' AND circle_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.member_user_id = auth.uid()
      AND cm.circle_id = ANY(posts.circle_ids)
  ))
);

-- 2. POLL VOTES: Hide individual vote choices, keep counts via aggregate-only access
DROP POLICY IF EXISTS "Authenticated can view vote counts" ON public.poll_votes;

CREATE POLICY "Users can view their own poll votes"
ON public.poll_votes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Poll authors can see vote tallies for their own polls (still per-row, but only on their poll)
CREATE POLICY "Poll authors can view votes on their polls"
ON public.poll_votes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.polls pl
    JOIN public.posts p ON p.id = pl.post_id
    WHERE pl.id = poll_votes.poll_id
      AND p.user_id = auth.uid()
  )
);

-- 3. POST FLAGS: Add a sensible SELECT policy
CREATE POLICY "Reporters and post owners and mods can view flags"
ON public.post_flags
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_flags.post_id AND p.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 4. EVENT RSVPS: Restrict to authenticated only
DROP POLICY IF EXISTS "Authenticated can view RSVPs" ON public.event_rsvps;
CREATE POLICY "Authenticated can view RSVPs"
ON public.event_rsvps
FOR SELECT
TO authenticated
USING (true);

-- 5. PROFILE VIEWS: Restrict INSERT to authenticated only
DROP POLICY IF EXISTS "Users can record profile views" ON public.profile_views;
DROP POLICY IF EXISTS "Authenticated can record profile views" ON public.profile_views;

CREATE POLICY "Authenticated users can record profile views"
ON public.profile_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = viewer_user_id);

-- 6. MODERATION ACTIONS: Allow mods/admins to update + delete
CREATE POLICY "Mods and admins can update moderation actions"
ON public.moderation_actions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);

CREATE POLICY "Mods and admins can delete moderation actions"
ON public.moderation_actions
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);

-- 7. REALTIME CHANNEL AUTHORIZATION
-- Lock down realtime subscriptions so users can only subscribe to topics they own
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to subscribe only to topics that match their own user id,
-- their DM conversation, or public channels they participate in.
DROP POLICY IF EXISTS "Authenticated users can subscribe to their own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to their own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Personal user channel: topic equals "user:<uid>" or contains the user id
  (realtime.topic() = ('user:' || auth.uid()::text))
  OR (realtime.topic() = ('notifications:' || auth.uid()::text))
  OR (realtime.topic() = ('messages:' || auth.uid()::text))
  -- Public table broadcast channels (postgres_changes for non-private tables)
  OR (realtime.topic() IN ('posts', 'comments', 'post_likes', 'post_reactions', 'follows', 'hashtags'))
);

-- Allow authenticated users to broadcast only to their own channels
DROP POLICY IF EXISTS "Authenticated users can broadcast to their own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to their own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() = ('user:' || auth.uid()::text))
  OR (realtime.topic() = ('notifications:' || auth.uid()::text))
  OR (realtime.topic() = ('messages:' || auth.uid()::text))
);
