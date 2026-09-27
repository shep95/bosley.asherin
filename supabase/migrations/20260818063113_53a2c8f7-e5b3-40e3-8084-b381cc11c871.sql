-- Feed engagement counts, computed in the database instead of by shipping every
-- like/comment row to the browser. SECURITY INVOKER so row-level access rules
-- still apply exactly as they do to a direct read.
CREATE OR REPLACE FUNCTION public.get_post_engagement(post_ids uuid[])
RETURNS TABLE (post_id uuid, likes_count bigint, comments_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id AS post_id,
    (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id) AS likes_count,
    (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id) AS comments_count
  FROM public.posts p
  WHERE p.id = ANY(post_ids)
$$;

GRANT EXECUTE ON FUNCTION public.get_post_engagement(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_engagement(uuid[]) TO service_role;

-- Indexes that make both the counts and the chronological feed cheap.
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_post ON public.post_likes (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_post ON public.bookmarks (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts (user_id, created_at DESC);