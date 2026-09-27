import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/layout/PageHeader";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";
import { 
  Loader2, Calendar, MessageSquare, Heart, 
  UserPlus, UserMinus, ArrowLeft, HelpCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AskQuestionForm from "@/components/qa/AskQuestionForm";
import PublicQADisplay from "@/components/qa/PublicQADisplay";
import { useStorageUrl } from "@/lib/storageUrl";

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("posts");

  // Fetch profile by username
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: async () => {
      if (!username) return null;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, cover_url, bio, created_at')
        .eq('username', username)
        .maybeSingle();
      return data;
    },
    enabled: !!username
  });

  // Covers live in the private "backgrounds" bucket; resolve to a signed URL.
  const coverUrl = useStorageUrl('backgrounds', profile?.cover_url);

  // Record profile view (if not own profile and not in stealth mode)
  const { data: userSettings } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_settings')
        .select('stealth_mode')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  // Record view when viewing another user's profile
  useQuery({
    queryKey: ['record-profile-view', profile?.user_id, user?.id],
    queryFn: async () => {
      if (!user || !profile || user.id === profile.user_id || userSettings?.stealth_mode) {
        return null;
      }
      // Check if already viewed recently (within last hour) to avoid spam
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentView } = await supabase
        .from('profile_views')
        .select('id')
        .eq('profile_user_id', profile.user_id)
        .eq('viewer_user_id', user.id)
        .gte('viewed_at', oneHourAgo)
        .maybeSingle();
      
      if (!recentView) {
        await supabase.from('profile_views').insert({
          profile_user_id: profile.user_id,
          viewer_user_id: user.id
        });
      }
      return null;
    },
    enabled: !!user && !!profile && user.id !== profile.user_id && userSettings !== undefined
  });

  // Check if following
  const { data: isFollowing } = useQuery({
    queryKey: ['is-following', user?.id, profile?.user_id],
    queryFn: async () => {
      if (!user || !profile) return false;
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', profile.user_id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!profile
  });

  // Fetch user's posts
  const { data: posts, isLoading: loadingPosts } = useQuery({
    queryKey: ['user-posts', profile?.user_id],
    queryFn: async () => {
      if (!profile) return [];
      
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false });
      
      if (!postsData) return [];

      const postIds = postsData.map(p => p.id);

      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);
      
      const likesCountMap = new Map<string, number>();
      likesData?.forEach(l => {
        likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1);
      });

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

      return postsData.map(post => ({
        ...post,
        profiles: profile,
        likesCount: likesCountMap.get(post.id) || 0,
        commentsCount: commentsCountMap.get(post.id) || 0,
        isLiked: userLikedSet.has(post.id),
        isBookmarked: userBookmarkedSet.has(post.id),
      }));
    },
    enabled: !!profile
  });

  // Fetch followers/following counts
  const { data: followStats } = useQuery({
    queryKey: ['follow-stats', profile?.user_id],
    queryFn: async () => {
      if (!profile) return { followers: 0, following: 0 };
      
      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profile.user_id);
      
      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profile.user_id);
      
      return { followers: followers || 0, following: following || 0 };
    },
    enabled: !!profile
  });

  // Follow/Unfollow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile) throw new Error("Not authenticated");
      
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profile.user_id);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: profile.user_id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['follow-stats'] });
      toast({ title: isFollowing ? "Unfollowed" : "Following" });
    }
  });

  const isOwnProfile = user?.id === profile?.user_id;

  if (loadingProfile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-foreground/60 font-light">User not found</p>
          <Link to="/explore" className="text-foreground hover:underline mt-4 inline-block">
            ← Back to Explore
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto pb-6">
        <PageHeader
          title={profile?.display_name || profile?.username || "Profile"}
          statusDot="bg-foreground/40"
          statusLabel={profile?.username ? `@${profile.username}` : undefined}
          actions={
            <Link
              to="/explore"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/60 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 rounded-lg px-3 h-9"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
          }
        />

        {/* Cover image */}
        <div className="relative h-32 sm:h-48 bg-foreground/5 overflow-hidden">
          {coverUrl && (
            <img 
              src={coverUrl} 
              alt="" 
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/40 pointer-events-none" />
        </div>

        {/* Profile info */}
        <div className="px-4">
          <div className="relative -mt-16 mb-4">
            <UserAvatar
              avatarUrl={profile?.avatar_url}
              username={profile?.username}
              size="xl"
              className="border-4 border-background"
            />
          </div>

          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-normal text-foreground">
                {profile?.display_name || profile?.username}
              </h1>
              <p className="text-foreground/40 font-light">@{profile?.username}</p>
              {profile?.bio && (
                <p className="text-foreground/80 font-light mt-2">{profile.bio}</p>
              )}
              
              <div className="flex items-center gap-4 mt-3 text-sm">
                <div className="flex items-center gap-1 text-foreground/60">
                  <Calendar className="w-4 h-4" />
                  <span className="font-light">
                    Joined {new Date(profile?.created_at || '').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 mt-2">
                <span className="text-foreground font-normal">
                  {followStats?.following} <span className="text-foreground/60 font-light">Following</span>
                </span>
                <span className="text-foreground font-normal">
                  {followStats?.followers} <span className="text-foreground/60 font-light">Followers</span>
                </span>
              </div>
            </div>
            
            {!isOwnProfile && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => navigate('/messages', { state: { userId: profile.user_id } })}
                  variant="ghost" 
                  size="icon"
                  className="rounded-lg"
                  aria-label="Message"
                >
                  <MessageSquare className="w-5 h-5" />
                </Button>
                <Button 
                  onClick={() => followMutation.mutate()}
                  variant={isFollowing ? "outline" : "default"}
                  className="rounded-lg font-light"
                  disabled={followMutation.isPending}
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="w-4 h-4 mr-2" />
                      Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Anonymous Q&A */}
        {!isOwnProfile && (
          <div className="px-4 mt-4">
            <AskQuestionForm 
              recipientUserId={profile.user_id} 
              recipientUsername={profile.username} 
            />
          </div>
        )}

        {/* Public Q&A Display */}
        <div className="px-4 mt-4">
          <PublicQADisplay userId={profile.user_id} />
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={pillTabsListClass}>
              <TabsTrigger value="posts" className={pillTabsTriggerClass}>Posts</TabsTrigger>
              <TabsTrigger value="likes" className={pillTabsTriggerClass}>
                <Heart className="w-3.5 h-3.5" /> Likes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="mt-4">
              {loadingPosts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                </div>
              ) : posts && posts.length > 0 ? (
                <div className="space-y-4">
                  {posts.map((post: any) => (
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
                    No posts yet.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="likes" className="mt-4">
              <div className="glass-card rounded-xl p-8 text-center">
                <p className="text-foreground/60 font-light">Likes are private.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default UserProfile;
