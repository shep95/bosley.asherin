import { supabase } from "@/integrations/supabase/client";
import { enrichPosts, type FeedPost } from "@/lib/postFeed";

/**
 * Paged post lists for profile pages. A page is 20 rows, ordered newest first
 * and continued with a created_at cursor, so no list ever downloads a whole
 * history or builds an .in() list longer than one page.
 */
export const PROFILE_PAGE_SIZE = 20;

export type PostsPage = { posts: FeedPost[]; nextCursor: string | null };

/** One page of a user's own posts, with counts from get_post_stats. */
export async function fetchUserPostsPage(
  userId: string,
  viewerId: string | undefined,
  cursor: string | null,
): Promise<PostsPage> {
  let query = supabase
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PROFILE_PAGE_SIZE);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const posts = await enrichPosts(rows, viewerId);
  return {
    posts,
    nextCursor: rows.length === PROFILE_PAGE_SIZE ? rows[rows.length - 1].created_at : null,
  };
}

/**
 * One page of the posts a user liked, newest like first. The cursor is the
 * like's created_at; posts the viewer can no longer see are simply skipped.
 */
export async function fetchLikedPostsPage(userId: string, cursor: string | null): Promise<PostsPage> {
  let query = supabase
    .from("post_likes")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PROFILE_PAGE_SIZE);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: likes, error } = await query;
  if (error) throw error;
  const likeRows = likes ?? [];
  if (likeRows.length === 0) return { posts: [], nextCursor: null };

  const { data: rows, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .in("id", likeRows.map((l) => l.post_id));
  if (postsError) throw postsError;

  // Keep the order of the likes, not of the posts.
  const byId = new Map((rows ?? []).map((p) => [p.id, p]));
  const ordered = likeRows.map((l) => byId.get(l.post_id)).filter((p): p is NonNullable<typeof p> => !!p);
  const posts = await enrichPosts(ordered, userId);
  return {
    posts,
    nextCursor: likeRows.length === PROFILE_PAGE_SIZE ? likeRows[likeRows.length - 1].created_at : null,
  };
}
