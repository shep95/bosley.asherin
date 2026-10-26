import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import UserAvatar from "@/components/UserAvatar";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { escapeLikeValue, peopleSearchTerm } from "@/lib/sanitize";
import { enrichPosts } from "@/lib/postFeed";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { friendlyDbError } from "@/lib/dbErrors";
import { useToast } from "@/hooks/use-toast";

type Person = { user_id: string; username: string; display_name: string | null; avatar_url: string | null; isFollowing?: boolean };
type Tag = { id: string; name: string; post_count: number };

const TagRow = ({ h, idx, onOpen }: { h: Tag; idx: number; onOpen: (h: Tag) => void }) => (
  <button
    onClick={() => onOpen(h)}
    className="row w-full text-left px-5 sm:px-8 py-4 flex items-baseline justify-between gap-4"
    style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
  >
    <span className="text-[15px] font-light text-foreground truncate">#{h.name}</span>
    <span className="text-[13px] font-light text-foreground/40 tabular-nums whitespace-nowrap">{h.post_count} posts</span>
  </button>
);

const RowSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="stagger" aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="row px-5 sm:px-8 py-4 flex items-center gap-4" style={{ "--i": i } as React.CSSProperties}>
        <div className="w-10 h-10 rounded-full bg-foreground/[0.07] animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-foreground/[0.08] animate-pulse" />
          <div className="h-3 w-44 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const Search = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("posts");

  // Every search waits for typing to pause (300ms) instead of firing per keystroke.
  const debounced = useDebouncedValue(query, 300);
  const settling = query.trim() !== debounced.trim();

  // Search posts
  const { data: posts, isLoading: postsLoading, isError: postsError, refetch: refetchPosts } = useQuery({
    queryKey: ['search-posts', user?.id, debounced],
    queryFn: async () => {
      const term = escapeLikeValue(debounced);
      if (!term) return [];
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('content', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      const now = new Date();
      const live = (postsData ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > now);
      return enrichPosts(live, user?.id);
    },
    enabled: activeTab === "posts" && debounced.trim().length > 0 && !!user
  });

  // Search users ("@handle" searches the handle without the @)
  const peopleTerm = peopleSearchTerm(debounced);
  const usersKey = ['search-users-page', user?.id, peopleTerm] as const;
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: usersKey,
    queryFn: async (): Promise<Person[]> => {
      const term = escapeLikeValue(peopleTerm);
      if (!term) return [];
      const pattern = `%${term}%`;
      // Two single-column filters instead of one .or(): nothing to escape in
      // filter grammar, and "john_doe" matches only john_doe.
      const [byUsername, byName] = await Promise.all([
        supabase.from('profiles').select('user_id, username, display_name, avatar_url').ilike('username', pattern).limit(20),
        supabase.from('profiles').select('user_id, username, display_name, avatar_url').ilike('display_name', pattern).limit(20),
      ]);
      if (byUsername.error) throw byUsername.error;
      if (byName.error) throw byName.error;
      const seen = new Set<string>();
      const data = [...(byUsername.data ?? []), ...(byName.data ?? [])]
        .filter((p) => (seen.has(p.user_id) ? false : (seen.add(p.user_id), true)))
        .slice(0, 20);
      if (!user || data.length === 0) return data;
      const { data: follows, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', data.map(p => p.user_id));
      if (error) throw error;
      const followSet = new Set(follows?.map(f => f.following_id) || []);
      return data.map(p => ({ ...p, isFollowing: followSet.has(p.user_id) }));
    },
    enabled: activeTab === "users" && peopleTerm.length > 0
  });

  // Search hashtags
  const tagTerm = debounced.replace(/^#+/, '');
  const { data: hashtags, isLoading: hashtagsLoading } = useQuery({
    queryKey: ['search-hashtags', tagTerm],
    queryFn: async () => {
      const term = escapeLikeValue(tagTerm);
      if (!term) return [];
      const { data, error } = await supabase
        .from('hashtags')
        .select('*')
        .ilike('name', `%${term}%`)
        .order('post_count', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: activeTab === "hashtags" && tagTerm.trim().length > 0
  });

  // Trending hashtags
  const { data: trending } = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hashtags')
        .select('*')
        .order('post_count', { ascending: false })
        .limit(10);
      return data || [];
    }
  });

  // Follow / unfollow: flip the row at once, put it back if the write fails.
  const followMutation = useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = isFollowing
        ? await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId)
        : await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
      if (error && !(error.code === '23505' && !isFollowing)) throw error;
    },
    onMutate: async ({ userId, isFollowing }) => {
      await queryClient.cancelQueries({ queryKey: usersKey });
      const previous = queryClient.getQueryData<Person[]>(usersKey);
      queryClient.setQueryData<Person[]>(usersKey, (rows) =>
        rows?.map((p) => (p.user_id === userId ? { ...p, isFollowing: !isFollowing } : p)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(usersKey, context.previous);
      toast({ title: friendlyDbError(error, "could not update. try again."), variant: "destructive" });
    },
    onSettled: () => {
      // The following feed and the person's profile both cache this.
      for (const root of ['following-ids', 'posts', 'is-following', 'follow-stats']) {
        queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });

  const isLoading = settling || (activeTab === 'posts' ? postsLoading : activeTab === 'users' ? usersLoading : hashtagsLoading);
  const openTag = (h: Tag) => { setQuery(`#${h.name}`); setActiveTab('posts'); };

  return (
    <DashboardLayout>
      <PageHeader
        title="search"
        subtitle="posts, people, tags."
        belowRow={
          <>
            <label className="field flex items-center gap-3">
              <SearchIcon className="w-4 h-4 text-foreground/40 shrink-0" aria-hidden />
              <input
                type="search"
                placeholder="what are you looking for"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                aria-label="search"
                className="w-full bg-transparent text-[15px] font-light text-foreground placeholder:text-foreground/35 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="clear" className="quiet p-2 -mr-2 rounded-md">
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
            {query && (
              <div role="tablist" aria-label="results" className="mt-4 flex items-center gap-6 border-b border-foreground/10">
                {([["posts", "posts"], ["users", "people"], ["hashtags", "tags"]] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className="text-tab text-[14px]">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        }
      />

      {!query && (
        trending && trending.length > 0 ? (
          <>
            <p className="px-5 sm:px-8 pt-2 pb-2 text-[12px] font-light text-foreground/40">tags people are using</p>
            <div className="stagger">
              {(trending as Tag[]).map((h, idx) => <TagRow key={h.id} h={h} idx={idx} onOpen={openTag} />)}
            </div>
          </>
        ) : (
          <EmptyState title="type to search." description="results appear as you type. posts first, then people and tags." />
        )
      )}

      {query && isLoading && (activeTab === 'posts' ? <FeedSkeleton count={3} /> : <RowSkeleton />)}

      {query && !isLoading && activeTab === 'posts' && (
        postsError && !posts ? (
          <EmptyState title="search did not load." description="check your connection and try again." actionLabel="try again" onAction={() => refetchPosts()} />
        ) : posts && posts.length > 0 ? (
          <div className="stagger">
            {posts.map((post, idx) => (
              <div key={post.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <PostCard
                  post={post}
                  likesCount={post.likesCount}
                  commentsCount={post.commentsCount}
                  repostCount={post.repostCount}
                  isLiked={post.isLiked}
                  isReposted={post.isReposted}
                  isBookmarked={post.isBookmarked}
                  hasPoll={post.hasPoll}
                  quotedPost={post.quotedPost}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="no posts match." description={`nothing contains "${query}". try fewer words, or look under people.`} actionLabel="people" onAction={() => setActiveTab('users')} />
        )
      )}

      {query && !isLoading && activeTab === 'users' && (
        users && users.length > 0 ? (
          <div className="stagger">
            {users.map((profile, idx) => (
              <div key={profile.user_id} className="row px-5 sm:px-8 py-4 flex items-center gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <Link to={`/user/${profile.username}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="md" className="shrink-0" />
                  <p className="flex items-baseline gap-x-2 text-[14px] font-light leading-none min-w-0">
                    <span className="text-foreground truncate">{profile.display_name || profile.username}</span>
                    <span className="text-foreground/40 truncate">@{profile.username}</span>
                  </p>
                </Link>
                {user?.id !== profile.user_id && (
                  <button
                    onClick={() => followMutation.mutate({ userId: profile.user_id, isFollowing: !!profile.isFollowing })}
                    disabled={followMutation.isPending && followMutation.variables?.userId === profile.user_id}
                    aria-pressed={!!profile.isFollowing}
                    className="quiet text-[13px] h-10 px-2 -mr-2 rounded-md shrink-0 disabled:opacity-50"
                  >
                    {profile.isFollowing ? "following" : "follow"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="no one by that name." description={`nothing matched "${query}". try part of a name, or a handle.`} />
        )
      )}

      {query && !isLoading && activeTab === 'hashtags' && (
        hashtags && hashtags.length > 0 ? (
          <div className="stagger">
            {(hashtags as Tag[]).map((h, idx) => <TagRow key={h.id} h={h} idx={idx} onOpen={openTag} />)}
          </div>
        ) : (
          <EmptyState title="no tags match." description={`no tag contains "${query.replace('#', '')}".`} />
        )
      )}
    </DashboardLayout>
  );
};

export default Search;
