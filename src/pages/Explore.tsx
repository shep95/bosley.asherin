import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import UserAvatar from "@/components/UserAvatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { escapeLikeValue, peopleSearchTerm } from "@/lib/sanitize";
import { enrichPosts } from "@/lib/postFeed";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { friendlyDbError } from "@/lib/dbErrors";

type Person = { user_id: string; username: string; display_name: string | null; avatar_url: string | null; bio?: string | null; isFollowing?: boolean };

const Explore = () => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"posts" | "users">("posts");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch topics
  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data } = await supabase.from('topics').select('*').order('name');
      return data || [];
    }
  });

  // Fetch posts by topic
  const { data: posts, isLoading, isError: postsError, refetch: refetchPosts } = useQuery({
    queryKey: ['explore-posts', user?.id, selectedTopic],
    queryFn: async () => {
      let query = supabase
        .from('posts')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedTopic) {
        query = query.eq('topic_id', selectedTopic);
      }

      const { data: postsData, error } = await query;
      if (error) throw error;

      // Counts, the viewer's own state, authors, polls and quotes: one
      // parallel round (get_post_stats) instead of downloading every row.
      return enrichPosts(postsData ?? [], user?.id);
    },
    enabled: activeTab === "posts" && !!user
  });

  // People search waits for typing to pause.
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const peopleTerm = peopleSearchTerm(debouncedSearch);
  const searchKey = ['search-users', user?.id, peopleTerm] as const;

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: searchKey,
    queryFn: async (): Promise<Person[]> => {
      const term = escapeLikeValue(peopleTerm);
      if (!term) return [];

      // Two single-column filters instead of one .or(): no filter grammar to
      // escape, and LIKE wildcards in the term are matched literally.
      const pattern = `%${term}%`;
      const [byUsername, byName] = await Promise.all([
        supabase.from('profiles').select('user_id, username, display_name, avatar_url, bio').ilike('username', pattern).limit(20),
        supabase.from('profiles').select('user_id, username, display_name, avatar_url, bio').ilike('display_name', pattern).limit(20),
      ]);
      if (byUsername.error) throw byUsername.error;
      if (byName.error) throw byName.error;
      const seen = new Set<string>();
      const data = [...(byUsername.data ?? []), ...(byName.data ?? [])]
        .filter((p) => (seen.has(p.user_id) ? false : (seen.add(p.user_id), true)))
        .slice(0, 20);

      if (!user || data.length === 0) return data;

      // Check which users we're following
      const { data: followData, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', data.map(p => p.user_id));
      if (error) throw error;

      const followingSet = new Set(followData?.map(f => f.following_id) || []);
      return data.map(profile => ({ ...profile, isFollowing: followingSet.has(profile.user_id) }));
    },
    enabled: activeTab === "users" && peopleTerm.length > 0
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
      await queryClient.cancelQueries({ queryKey: searchKey });
      const previous = queryClient.getQueryData<Person[]>(searchKey);
      queryClient.setQueryData<Person[]>(searchKey, (rows) =>
        rows?.map((p) => (p.user_id === userId ? { ...p, isFollowing: !isFollowing } : p)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(searchKey, context.previous);
      toast({ title: friendlyDbError(error, "could not update. try again."), variant: "destructive" });
    },
    onSettled: () => {
      // The following feed and the person's profile both cache this.
      for (const root of ['following-ids', 'posts', 'is-following', 'follow-stats']) {
        queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });

  return (
    <DashboardLayout>
      <PageHeader
        title="explore"
        subtitle="people and posts, newest first."
        belowRow={
          <div role="tablist" aria-label="explore" className="flex items-center gap-6 border-b border-foreground/10">
            {([["posts", "posts"], ["users", "people"]] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className="text-tab text-[14px]"
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {activeTab === "posts" && (
        <>
          {topics && topics.length > 0 && (
            <div role="tablist" aria-label="topics" className="row px-5 sm:px-8 flex items-center gap-5 overflow-x-auto text-[13px]">
              <button role="tab" aria-selected={!selectedTopic} onClick={() => setSelectedTopic(null)} className="text-tab whitespace-nowrap">
                all
              </button>
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  role="tab"
                  aria-selected={selectedTopic === topic.id}
                  onClick={() => setSelectedTopic(topic.id)}
                  className="text-tab whitespace-nowrap lowercase"
                >
                  {topic.name}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <FeedSkeleton count={4} />
          ) : postsError && !posts ? (
            <EmptyState
              title="explore did not load."
              description="check your connection and try again."
              actionLabel="try again"
              onAction={() => refetchPosts()}
            />
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
            <EmptyState
              title="nothing here yet."
              description={selectedTopic ? "no one has written under this topic. try another, or write the first." : "the room is quiet. write the first thing."}
              actionLabel="write something"
              actionTo="/dashboard"
            />
          )}
        </>
      )}

      {activeTab === "users" && (
        <>
          <div className="px-5 sm:px-8 pt-2 pb-4">
            <label className="field flex items-center gap-3">
              <Search className="w-4 h-4 text-foreground/40 shrink-0" aria-hidden />
              <input
                type="search"
                placeholder="a name or @handle"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                aria-label="search people"
                className="w-full bg-transparent text-[15px] font-light text-foreground placeholder:text-foreground/35 focus:outline-none"
              />
            </label>
          </div>

          {searchLoading || (searchQuery.trim() !== debouncedSearch.trim() && peopleSearchTerm(searchQuery).length > 0) ? (
            <div className="stagger" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="row px-5 sm:px-8 py-4 flex items-center gap-4" style={{ "--i": i } as React.CSSProperties}>
                  <div className="w-10 h-10 rounded-full bg-foreground/[0.07] animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 rounded bg-foreground/[0.08] animate-pulse" />
                    <div className="h-3 w-44 rounded bg-foreground/[0.06] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="stagger">
              {searchResults.map((profile, idx) => (
                <div
                  key={profile.user_id}
                  className="row px-5 sm:px-8 py-4 flex items-center gap-4"
                  style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                >
                  <Link to={`/user/${profile.username}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="md" className="shrink-0" />
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-x-2 text-[14px] font-light leading-none min-w-0">
                        <span className="text-foreground truncate">{profile.display_name || profile.username}</span>
                        <span className="text-foreground/40 truncate">@{profile.username}</span>
                      </p>
                      {profile.bio && <p className="mt-1.5 text-[13px] font-light text-foreground/50 truncate">{profile.bio}</p>}
                    </div>
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
          ) : peopleTerm ? (
            <EmptyState
              title="no one by that name."
              description={`nothing matched "${searchQuery}". try part of a name, or a handle.`}
            />
          ) : (
            <EmptyState
              title="find someone."
              description="type a name or a handle. results appear as you type."
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default Explore;
