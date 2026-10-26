import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import LoadMoreButton from "@/components/LoadMoreButton";
import { fetchUserPostsPage } from "@/lib/profilePosts";
import { formatMemberNumber, isFounding } from "@/lib/member";
import { friendlyDbError, isUniqueViolation } from "@/lib/dbErrors";

const UserProfile = () => {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("posts");

  // Fetch profile by username
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: async () => {
      if (!username) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, cover_url, bio, created_at, location, pronouns, website, member_number')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!username
  });

  // Covers live in the private "backgrounds" bucket; resolve to a signed URL.
  const coverUrl = useStorageUrl('backgrounds', profile?.cover_url);

  // Record one view per mount of another person's profile. The RPC decides
  // the rest server-side: at most one per hour, nothing in stealth mode, and
  // nothing for your own profile. Best effort; a failure is not shown.
  const viewedRef = useRef<string | null>(null);
  const profileUserId = profile?.user_id;
  useEffect(() => {
    if (!user || !profileUserId || profileUserId === user.id) return;
    if (viewedRef.current === profileUserId) return;
    viewedRef.current = profileUserId;
    void supabase.rpc('record_profile_view', { _profile_user: profileUserId }).then(() => undefined, () => undefined);
  }, [user, profileUserId]);

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

  // Their posts, 20 at a time, with counts from get_post_stats per page.
  const postsQuery = useInfiniteQuery({
    queryKey: ['user-posts', profile?.user_id],
    queryFn: ({ pageParam }) => fetchUserPostsPage(profile!.user_id, user?.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!profile,
  });
  const posts = postsQuery.data?.pages.flatMap((p) => p.posts);
  const loadingPosts = postsQuery.isLoading;

  // Fetch followers/following counts
  const { data: followStats } = useQuery({
    queryKey: ['follow-stats', profile?.user_id],
    queryFn: async () => {
      if (!profile) return { followers: 0, following: 0 };

      const [{ count: followers }, { count: following }] = await Promise.all([
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', profile.user_id),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', profile.user_id),
      ]);

      return { followers: followers || 0, following: following || 0 };
    },
    enabled: !!profile
  });

  // Follow/unfollow, optimistic: the button and the count move at once and
  // move back if the write fails.
  const followKey = ['is-following', user?.id, profile?.user_id];
  const statsKey = ['follow-stats', profile?.user_id];
  type FollowStats = { followers: number; following: number };
  const followMutation = useMutation({
    mutationFn: async (follow: boolean) => {
      if (!user || !profile) throw new Error("Not authenticated");

      if (!follow) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profile.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: profile.user_id });
        // Already following (double tap, another tab): the end state is right.
        if (error && !isUniqueViolation(error)) throw error;
      }
    },
    onMutate: async (follow) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: followKey }),
        queryClient.cancelQueries({ queryKey: statsKey }),
      ]);
      const prevFollowing = queryClient.getQueryData<boolean>(followKey);
      const prevStats = queryClient.getQueryData<FollowStats>(statsKey);
      queryClient.setQueryData<boolean>(followKey, follow);
      if (prevStats) {
        queryClient.setQueryData<FollowStats>(statsKey, {
          ...prevStats,
          followers: Math.max(0, prevStats.followers + (follow ? 1 : -1)),
        });
      }
      return { prevFollowing, prevStats };
    },
    onError: (error, _follow, context) => {
      if (context) {
        queryClient.setQueryData(followKey, context.prevFollowing);
        queryClient.setQueryData(statsKey, context.prevStats);
      }
      toast({ title: friendlyDbError(error, "that did not go through. try again."), variant: "destructive" });
    },
    onSuccess: (_data, follow) => {
      toast({ title: follow ? "following" : "unfollowed" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['follow-stats'] });
      // The "following" feed reads this list (cached a minute).
      queryClient.invalidateQueries({ queryKey: ['following-ids'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
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
            onClick={() => (location.key !== "default" ? navigate(-1) : navigate('/explore'))}
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
            {/* Wraps the actions under the name when both do not fit (phones). */}
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
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
                        onClick={() => followMutation.mutate(false)}
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
                        onClick={() => followMutation.mutate(true)}
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
            {profile.member_number != null && (
              <p className="mt-0.5 text-[12px] font-light text-foreground/40 tabular-nums">
                member {formatMemberNumber(profile.member_number)}
                {isFounding(profile.member_number) && " · founding"}
              </p>
            )}
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
                    repostCount={post.repostCount}
                    isReposted={post.isReposted}
                    hasPoll={post.hasPoll}
                    quotedPost={post.quotedPost}
                  />
                </div>
              ))}
            </div>
          ) : postsQuery.isError ? (
            <EmptyState title="could not load these." description="check your connection and try again." />
          ) : (
            <EmptyState
              title="nothing posted yet."
              description={`${name} has not written anything here. follow them and you will see it when they do.`}
            />
          )}
          {posts && posts.length > 0 && (
            <LoadMoreButton
              hasMore={postsQuery.hasNextPage}
              loading={postsQuery.isFetchingNextPage}
              onClick={() => { void postsQuery.fetchNextPage(); }}
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
