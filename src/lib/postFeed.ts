import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * One way to turn a page of post rows into what a feed card needs.
 *
 * Every list (dashboard, explore, search, bookmarks) used to download raw
 * like / comment / bookmark rows to count them (wrong past the 1,000-row
 * PostgREST cap, and never including reposts), and every card then ran its own
 * 1–4 poll queries. Here a page costs, in parallel:
 *   - get_post_stats(ids): counts + the viewer's liked / reposted / bookmarked
 *   - profiles for the authors
 *   - polls(post_id) for the page, so PollDisplay mounts only where a poll exists
 *   - the quoted posts, if any (plus their authors when not already loaded)
 */

export type PostRow = Tables<"posts">;

export type FeedProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type QuotedPost = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  content_warning: string | null;
  is_nsfw: boolean | null;
  profiles: FeedProfile | null;
};

export type FeedPost = PostRow & {
  profiles: FeedProfile | null;
  likesCount: number;
  commentsCount: number;
  repostCount: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  hasPoll: boolean;
  quotedPost: QuotedPost | null;
};

const PROFILE_COLUMNS = "user_id, username, display_name, avatar_url";

/**
 * Enrich a page of posts. Pass the signed-in viewer's id; get_post_stats is
 * not available to anonymous callers. Throws on any failed read so the caller
 * shows an error state instead of silently blank counts.
 */
export async function enrichPosts(rows: PostRow[], viewerId: string | undefined): Promise<FeedPost[]> {
  if (rows.length === 0) return [];

  const postIds = rows.map((p) => p.id);
  const authorIds = [...new Set(rows.map((p) => p.user_id))];
  const quotedIds = [...new Set(rows.map((p) => p.quoted_post_id).filter((id): id is string => !!id))];

  const [profilesRes, statsRes, pollsRes, quotedRes] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).in("user_id", authorIds),
    viewerId
      ? supabase.rpc("get_post_stats", { post_ids: postIds })
      : Promise.resolve({ data: [], error: null }),
    viewerId
      ? supabase.from("polls").select("post_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as { post_id: string }[], error: null }),
    quotedIds.length > 0
      ? supabase
          .from("posts")
          .select("id, content, created_at, user_id, content_warning, is_nsfw")
          .in("id", quotedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (statsRes.error) throw statsRes.error;
  if (pollsRes.error) throw pollsRes.error;
  if (quotedRes.error) throw quotedRes.error;

  const profiles = new Map<string, FeedProfile>((profilesRes.data ?? []).map((p) => [p.user_id, p]));

  // Quoted authors who are not already on the page: one more small read.
  const quotedRows = (quotedRes.data ?? []) as Omit<QuotedPost, "profiles">[];
  const missingAuthors = [...new Set(quotedRows.map((q) => q.user_id))].filter((id) => !profiles.has(id));
  if (missingAuthors.length > 0) {
    const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("user_id", missingAuthors);
    if (error) throw error;
    for (const p of data ?? []) profiles.set(p.user_id, p);
  }

  const stats = new Map((statsRes.data ?? []).map((s) => [s.post_id, s]));
  const withPoll = new Set((pollsRes.data ?? []).map((p) => p.post_id));
  const quoted = new Map<string, QuotedPost>(
    quotedRows.map((q) => [q.id, { ...q, profiles: profiles.get(q.user_id) ?? null }]),
  );

  return rows.map((post) => {
    const s = stats.get(post.id);
    return {
      ...post,
      profiles: profiles.get(post.user_id) ?? null,
      likesCount: Number(s?.likes_count) || 0,
      commentsCount: Number(s?.comments_count) || 0,
      repostCount: Number(s?.reposts_count) || 0,
      isLiked: !!s?.liked,
      isReposted: !!s?.reposted,
      isBookmarked: !!s?.bookmarked,
      hasPoll: withPoll.has(post.id),
      quotedPost: post.quoted_post_id ? quoted.get(post.quoted_post_id) ?? null : null,
    };
  });
}

/** Query-key roots of every list that shows posts, for invalidation after a write. */
export const FEED_QUERY_ROOTS = [
  "posts",
  "explore-posts",
  "search-posts",
  "bookmarks",
  "user-posts",
  "embedded-feed",
] as const;

/** One quoted post with its author, for a card or the composer preview. Null when gone or hidden. */
export async function fetchQuotedPost(id: string): Promise<QuotedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, created_at, user_id, content_warning, is_nsfw")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", data.user_id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { ...data, profiles: profile ?? null };
}
