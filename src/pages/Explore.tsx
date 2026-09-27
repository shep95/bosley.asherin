import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import UserAvatar from "@/components/UserAvatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, TrendingUp, Search, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";
import { escapeFilterValue } from "@/lib/sanitize";

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
  const { data: posts, isLoading } = useQuery({
    queryKey: ['explore-posts', selectedTopic],
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

      // Fetch profiles
      const userIds = [...new Set(postsData?.map(p => p.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);
      
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      // Fetch likes counts
      const postIds = postsData?.map(p => p.id) || [];
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);
      
      const likesCountMap = new Map<string, number>();
      likesData?.forEach(l => {
        likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1);
      });

      // Check user interactions
      const { data: userLikes } = user ? await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds) : { data: [] };
      
      const userLikedSet = new Set(userLikes?.map(l => l.post_id) || []);

      const { data: userBookmarks } = user ? await supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds) : { data: [] };
      
      const userBookmarkedSet = new Set(userBookmarks?.map(b => b.post_id) || []);

      const { data: commentsData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);
      
      const commentsCountMap = new Map<string, number>();
      commentsData?.forEach(c => {
        commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1);
      });

      return postsData?.map(post => ({
        ...post,
        profiles: profilesMap.get(post.user_id) || null,
        likesCount: likesCountMap.get(post.id) || 0,
        commentsCount: commentsCountMap.get(post.id) || 0,
        isLiked: userLikedSet.has(post.id),
        isBookmarked: userBookmarkedSet.has(post.id),
      })) || [];
    },
    enabled: activeTab === "posts"
  });

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: async () => {
      const term = escapeFilterValue(searchQuery);
      if (!term) return [];
      
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(20);
      
      if (!data || !user) return data || [];

      // Check which users we're following
      const userIds = data.map(p => p.user_id);
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', userIds);
      
      const followingSet = new Set(followData?.map(f => f.following_id) || []);
      
      return data.map(profile => ({
        ...profile,
        isFollowing: followingSet.has(profile.user_id)
      }));
    },
    enabled: activeTab === "users" && searchQuery.length > 0
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-users'] });
      toast({ title: "Updated" });
    }
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <PageHeader
          title="Explore"
          statusDot="bg-emerald-500"
          statusLabel="Trending across Bosley"
          belowRow={
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "posts" | "users")}>
              <TabsList className={pillTabsListClass}>
                <TabsTrigger value="posts" className={pillTabsTriggerClass}>
                  <TrendingUp className="w-3.5 h-3.5" /> Posts
                </TabsTrigger>
                <TabsTrigger value="users" className={pillTabsTriggerClass}>
                  Find People
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />

        <div className="px-4 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "posts" | "users")}>

          <TabsContent value="posts">
            {/* Topic filters — monochrome pill chips */}
            <div className="flex flex-wrap gap-1.5 mb-6">
              <button
                onClick={() => setSelectedTopic(null)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                  !selectedTopic
                    ? 'bg-foreground/10 text-foreground border-foreground/10'
                    : 'bg-foreground/5 text-foreground/50 border-transparent hover:text-foreground hover:bg-foreground/10'
                }`}
              >
                All
              </button>
              {topics?.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopic(topic.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                    selectedTopic === topic.id
                      ? 'bg-foreground/10 text-foreground border-foreground/10'
                      : 'bg-foreground/5 text-foreground/50 border-transparent hover:text-foreground hover:bg-foreground/10'
                  }`}
                >
                  {topic.name}
                </button>
              ))}
            </div>

            {/* Posts */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
              </div>
            ) : posts && posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    likesCount={post.likesCount}
                    commentsCount={post.commentsCount}
                    isLiked={post.isLiked}
                    isBookmarked={post.isBookmarked}
                  />
                ))}
              </div>
            ) : (
              <div className="glass-card rounded-xl p-8 text-center">
                <p className="text-foreground/60 font-light">
                  No posts found in this topic yet.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="users">
            {/* Search input */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <Input
                placeholder="Search by username or display name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-foreground/5 border-foreground/10 rounded-lg font-light h-11 focus-visible:ring-foreground/20"
              />
            </div>

            {/* Search results */}
            {searchLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((profile: any) => (
                  <div
                    key={profile.user_id}
                    className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-accent/10 transition-colors"
                  >
                    <Link 
                      to={`/user/${profile.username}`}
                      className="flex items-center gap-3 flex-1"
                    >
                      <UserAvatar
                        avatarUrl={profile.avatar_url}
                        username={profile.username}
                        size="md"
                      />
                      <div>
                        <p className="text-foreground font-normal">
                          {profile.display_name || profile.username}
                        </p>
                        <p className="text-foreground/40 font-light text-sm">
                          @{profile.username}
                        </p>
                      </div>
                    </Link>
                    
                    {user?.id !== profile.user_id && (
                      <Button
                        variant={profile.isFollowing ? "outline" : "default"}
                        size="sm"
                        onClick={() => followMutation.mutate({ 
                          userId: profile.user_id, 
                          isFollowing: profile.isFollowing 
                        })}
                        disabled={followMutation.isPending}
                        className="rounded-lg font-light"
                      >
                        {profile.isFollowing ? (
                          <>
                            <UserMinus className="w-4 h-4 mr-1" />
                            Unfollow
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4 mr-1" />
                            Follow
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : searchQuery ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <p className="text-foreground/60 font-light">
                  No users found matching "{searchQuery}"
                </p>
              </div>
            ) : (
              <div className="glass-card rounded-xl p-8 text-center">
                <Search className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                <p className="text-foreground/60 font-light">
                  Search for users to follow
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Explore;
