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
import { escapeFilterValue } from "@/lib/sanitize";

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
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("posts");

  // Search posts
  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      const term = escapeFilterValue(query);
      if (!term) return [];
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .ilike('content', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!postsData?.length) return [];

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const postIds = postsData.map(p => p.id);
      const { data: likes } = await supabase.from('post_likes').select('post_id').in('post_id', postIds);
      const likesMap = new Map<string, number>();
      likes?.forEach(l => likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1));

      const { data: comments } = await supabase.from('comments').select('post_id').in('post_id', postIds);
      const commentsMap = new Map<string, number>();
      comments?.forEach(c => commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1));

      const { data: userLikes } = user ? await supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds) : { data: [] };
      const likedSet = new Set(userLikes?.map(l => l.post_id) || []);
      const { data: userBookmarks } = user ? await supabase.from('bookmarks').select('post_id').eq('user_id', user.id).in('post_id', postIds) : { data: [] };
      const bookmarkedSet = new Set(userBookmarks?.map(b => b.post_id) || []);

      return postsData.map(p => ({
        ...p,
        profiles: profileMap.get(p.user_id) || null,
        likesCount: likesMap.get(p.id) || 0,
        commentsCount: commentsMap.get(p.id) || 0,
        isLiked: likedSet.has(p.id),
        isBookmarked: bookmarkedSet.has(p.id),
      }));
    },
    enabled: activeTab === "posts" && query.length > 0
  });

  // Search users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['search-users-page', query],
    queryFn: async () => {
      const term = escapeFilterValue(query);
      if (!term) return [];
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(20);
      if (!data || !user) return data || [];
      const userIds = data.map(p => p.user_id);
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).in('following_id', userIds);
      const followSet = new Set(follows?.map(f => f.following_id) || []);
      return data.map(p => ({ ...p, isFollowing: followSet.has(p.user_id) }));
    },
    enabled: activeTab === "users" && query.length > 0
  });

  // Search hashtags
  const { data: hashtags, isLoading: hashtagsLoading } = useQuery({
    queryKey: ['search-hashtags', query],
    queryFn: async () => {
      const term = escapeFilterValue(query.replace('#', ''));
      if (!term) return [];
      const { data } = await supabase
        .from('hashtags')
        .select('*')
        .ilike('name', `%${term}%`)
        .order('post_count', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: activeTab === "hashtags" && query.length > 0
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

  const followMutation = useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId);
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-users-page'] })
  });

  const isLoading = activeTab === 'posts' ? postsLoading : activeTab === 'users' ? usersLoading : hashtagsLoading;
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
        posts && posts.length > 0 ? (
          <div className="stagger">
            {posts.map((post, idx) => (
              <div key={post.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <PostCard post={post} likesCount={post.likesCount} commentsCount={post.commentsCount} isLiked={post.isLiked} isBookmarked={post.isBookmarked} />
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
            {(users as Person[]).map((profile, idx) => (
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
                    disabled={followMutation.isPending}
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
