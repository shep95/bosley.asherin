import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AskQuestionForm from "@/components/qa/AskQuestionForm";
import PublicQADisplay from "@/components/qa/PublicQADisplay";
import { useStorageUrl } from "@/lib/storageUrl";
import { ProfileFacts, ProfileSkeleton } from "@/pages/Profile";

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
        .select('user_id, username, display_name, avatar_url, cover_url, bio, created_at, location, pronouns, website')
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
      toast({ title: isFollowing ? "unfollowed" : "following" });
    }
  });

  const isOwnProfile = user?.id === profile?.user_id;

  if (loadingProfile) {
    return (
      <DashboardLayout>
        <PageHeader title="profile" />
        <ProfileSkeleton />
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <PageHeader title="profile" subtitle="no one by that name." />
        <EmptyState
          title="no one here."
          description={`there is no @${username ?? ""} in this room. they may have changed their name or left.`}
          actionLabel="find people"
          actionTo="/explore"
        />
      </DashboardLayout>
    );
  }

  const name = profile.display_name || profile.username;

  return (
    <DashboardLayout>
      <PageHeader
        title="profile"
        subtitle={isOwnProfile ? "how the room sees you." : "what they chose to share."}
        actions={
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/explore'))}
            className="quiet text-[13px] px-2 h-9 rounded-md"
          >
            ← back
          </button>
        }
      />

      {coverUrl && (
        <div className="px-5 sm:px-8 pb-1">
          <div className="relative h-[120px] rounded-md overflow-hidden">
            <img src={coverUrl} alt="" className="wallpaper w-full h-full object-cover" />
            <div className="absolute inset-0 bg-background/40 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="row px-5 sm:px-8 py-5">
        <div className="flex items-start gap-4">
          <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="lg" />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-[26px] font-extralight leading-tight tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
                {name}
              </h2>
              <div className="flex items-center gap-1 shrink-0 -mr-2">
                {isOwnProfile ? (
                  <button type="button" onClick={() => navigate('/profile')} className="quiet px-2 h-9 rounded-md text-[13px]">
                    edit
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/messages', { state: { userId: profile.user_id } })}
                      className="quiet px-2 h-9 rounded-md text-[13px]"
                    >
                      message
                    </button>
                    {isFollowing ? (
                      <button
                        type="button"
                        onClick={() => followMutation.mutate()}
                        disabled={followMutation.isPending}
                        aria-pressed="true"
                        className="quiet px-2 h-9 rounded-md text-[13px] disabled:opacity-50"
                      >
                        {followMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "following"}
                      </button>
                    ) : (
                      <Button
                        variant="signal"
                        size="sm"
                        onClick={() => followMutation.mutate()}
                        disabled={followMutation.isPending || !user}
                        className="ml-1"
                      >
                        {followMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        follow
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <p className="mt-0.5 text-[13px] font-light text-foreground/40">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2.5 text-[15px] font-light leading-relaxed text-foreground/85 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {profile.bio}
              </p>
            )}
            <ProfileFacts
              createdAt={profile.created_at}
              location={profile.location}
              pronouns={profile.pronouns}
              website={profile.website}
            />
            <p className="mt-2 text-[13px] font-light text-foreground/60 tabular-nums">
              {followStats?.following ?? 0} following
              <span className="mx-1.5 text-foreground/25">·</span>
              {followStats?.followers ?? 0} followers
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-5 sm:px-8 pt-2">
          <TabsList className={pillTabsListClass}>
            <TabsTrigger value="posts" className={pillTabsTriggerClass}>posts</TabsTrigger>
            <TabsTrigger value="qa" className={pillTabsTriggerClass}>q&amp;a</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="posts" className="mt-0">
          {loadingPosts ? (
            <FeedSkeleton count={3} />
          ) : posts && posts.length > 0 ? (
            <div className="stagger">
              {posts.map((post, idx) => (
                <div key={post.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                  <PostCard
                    post={post}
                    likesCount={post.likesCount}
                    commentsCount={post.commentsCount}
                    isLiked={post.isLiked}
                    isBookmarked={post.isBookmarked}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="nothing posted yet."
              description={`${name} has not written anything here. follow them and you will see it when they do.`}
            />
          )}
        </TabsContent>

        <TabsContent value="qa" className="mt-0">
          {!isOwnProfile && (
            <AskQuestionForm recipientUserId={profile.user_id} recipientUsername={profile.username} />
          )}
          <PublicQADisplay userId={profile.user_id} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default UserProfile;
