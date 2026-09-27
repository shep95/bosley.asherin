import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search as SearchIcon, Loader2, UserPlus, UserMinus, Hash, TrendingUp, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import UserAvatar from "@/components/UserAvatar";
import PostCard from "@/components/feed/PostCard";
import PageHeader from "@/components/layout/PageHeader";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";
import { escapeFilterValue } from "@/lib/sanitize";

const Search = () => {
  const { user } = useAuth();
  const { toast } = useToast();
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

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <PageHeader
          title="Search"
          statusDot="bg-foreground/40"
          statusLabel={query ? `Searching "${query}"` : "Discover posts, people & hashtags"}
          belowRow={
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 pointer-events-none" />
              <Input
                placeholder="Search posts, people, hashtags..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-10 pr-10 bg-foreground/5 border-foreground/10 rounded-lg font-light h-11 focus-visible:ring-foreground/20"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          }
        />

        <div className="px-4 py-6">
        {/* Trending when no query */}
        {!query && trending && trending.length > 0 && (
          <div className="glass-card rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-foreground/60" />
              <h2 className="text-foreground/80 font-light">Trending</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {trending.map(h => (
                <button
                  key={h.id}
                  onClick={() => { setQuery(`#${h.name}`); setActiveTab('posts'); }}
                  className="px-3 py-1.5 rounded-lg bg-foreground/5 text-foreground/70 text-sm font-light hover:bg-foreground/10 transition-colors"
                >
                  #{h.name} <span className="text-foreground/30 ml-1">{h.post_count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {query && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`${pillTabsListClass} mb-6`}>
              <TabsTrigger value="posts" className={pillTabsTriggerClass}>Posts</TabsTrigger>
              <TabsTrigger value="users" className={pillTabsTriggerClass}>People</TabsTrigger>
              <TabsTrigger value="hashtags" className={pillTabsTriggerClass}>Hashtags</TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
            ) : (
              <>
                <TabsContent value="posts">
                  {posts && posts.length > 0 ? (
                    <div className="space-y-4">
                      {posts.map((post: any) => (
                        <PostCard key={post.id} post={post} likesCount={post.likesCount} commentsCount={post.commentsCount} isLiked={post.isLiked} isBookmarked={post.isBookmarked} />
                      ))}
                    </div>
                  ) : (
                    <div className="glass-card rounded-xl p-8 text-center">
                      <p className="text-foreground/60 font-light">No posts found for "{query}"</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="users">
                  {users && users.length > 0 ? (
                    <div className="space-y-2">
                      {users.map((profile: any) => (
                        <div key={profile.user_id} className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-accent/10 transition-colors">
                          <Link to={`/user/${profile.username}`} className="flex items-center gap-3 flex-1">
                            <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="md" />
                            <div>
                              <p className="text-foreground font-normal">{profile.display_name || profile.username}</p>
                              <p className="text-foreground/40 font-light text-sm">@{profile.username}</p>
                            </div>
                          </Link>
                          {user?.id !== profile.user_id && (
                            <Button
                              variant={profile.isFollowing ? "outline" : "default"}
                              size="sm"
                              onClick={() => followMutation.mutate({ userId: profile.user_id, isFollowing: profile.isFollowing })}
                              className="rounded-lg font-light"
                            >
                              {profile.isFollowing ? <><UserMinus className="w-4 h-4 mr-1" />Unfollow</> : <><UserPlus className="w-4 h-4 mr-1" />Follow</>}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="glass-card rounded-xl p-8 text-center">
                      <p className="text-foreground/60 font-light">No users found</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="hashtags">
                  {hashtags && hashtags.length > 0 ? (
                    <div className="space-y-2">
                      {hashtags.map((h: any) => (
                        <button
                          key={h.id}
                          onClick={() => { setQuery(`#${h.name}`); setActiveTab('posts'); }}
                          className="w-full glass-card rounded-xl p-4 text-left hover:bg-accent/10 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Hash className="w-5 h-5 text-foreground/40" />
                            <span className="text-foreground font-normal">#{h.name}</span>
                          </div>
                          <p className="text-foreground/40 text-sm font-light mt-1">{h.post_count} posts</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="glass-card rounded-xl p-8 text-center">
                      <p className="text-foreground/60 font-light">No hashtags found</p>
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Search;
