import { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stripMetadata } from "@/lib/mediaSanitize";
import { validateUpload, extensionForMime, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES } from "@/lib/sanitize";
import { useStorageUrl } from "@/lib/storageUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QAInbox from "@/components/qa/QAInbox";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";

const NAME_MAX = 50;
const BIO_MAX = 160;

/** "joined august 2026 · portland · she/her · example.com" — only what is set. */
export const ProfileFacts = ({
  createdAt,
  location,
  pronouns,
  website,
}: {
  createdAt?: string | null;
  location?: string | null;
  pronouns?: string | null;
  website?: string | null;
}) => {
  const facts: React.ReactNode[] = [];
  if (createdAt) {
    facts.push(
      <span key="joined">
        joined {new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toLowerCase()}
      </span>,
    );
  }
  if (location) facts.push(<span key="loc">{location}</span>);
  if (pronouns) facts.push(<span key="pro">{pronouns}</span>);
  if (website) {
    const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const label = website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    facts.push(
      <a
        key="web"
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-foreground/70 hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        {label}
      </a>,
    );
  }
  if (facts.length === 0) return null;
  return (
    <p className="mt-2.5 text-[13px] font-light text-foreground/45 leading-relaxed">
      {facts.map((f, i) => (
        <span key={i} className="inline-block whitespace-nowrap">
          {f}
          {i < facts.length - 1 && <span className="mx-1.5 text-foreground/25">·</span>}
        </span>
      ))}
    </p>
  );
};

export const ProfileSkeleton = () => (
  <div className="row px-5 sm:px-8 py-5" aria-busy="true" aria-label="loading profile">
    <div className="flex items-start gap-4">
      <div className="w-16 h-16 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
      <div className="flex-1 space-y-3 pt-2">
        <div className="h-5 w-40 rounded bg-foreground/[0.08] animate-pulse" />
        <div className="h-3 w-24 rounded bg-foreground/[0.05] animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-foreground/[0.05] animate-pulse" />
      </div>
    </div>
  </div>
);

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedBio, setEditedBio] = useState("");
  const [activeTab, setActiveTab] = useState("posts");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch profile
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, cover_url, bio, created_at, location, pronouns, website')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  // Covers live in the private "backgrounds" bucket; resolve to a signed URL.
  const coverUrl = useStorageUrl('backgrounds', profile?.cover_url);

  // Fetch user's posts
  const { data: posts, isLoading: loadingPosts } = useQuery({
    queryKey: ['user-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
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

      const { data: userLikes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);

      const userLikedSet = new Set(userLikes?.map(l => l.post_id) || []);

      const { data: userBookmarks } = await supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);

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
    enabled: !!user && !!profile
  });

  // Fetch liked posts
  const { data: likedPosts, isLoading: loadingLiked } = useQuery({
    queryKey: ['liked-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id);

      if (!likes || likes.length === 0) return [];

      const postIds = likes.map(l => l.post_id);
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .in('id', postIds)
        .order('created_at', { ascending: false });

      if (!postsData) return [];

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return postsData.map(post => ({
        ...post,
        profiles: profilesMap.get(post.user_id) || null,
        likesCount: 0,
        commentsCount: 0,
        isLiked: true,
        isBookmarked: false,
      }));
    },
    enabled: !!user && activeTab === 'likes'
  });

  // Fetch followers/following counts
  const { data: followStats } = useQuery({
    queryKey: ['follow-stats', user?.id],
    queryFn: async () => {
      if (!user) return { followers: 0, following: 0 };

      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);

      return { followers: followers || 0, following: following || 0 };
    },
    enabled: !!user
  });

  // Update profile
  const updateProfile = useMutation({
    mutationFn: async (updates: { display_name?: string; bio?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setIsEditing(false);
      toast({ title: "profile saved" });
    },
    onError: () => {
      toast({ title: "could not save", description: "check your connection and try again.", variant: "destructive" });
    }
  });

  // Upload avatar/cover
  const uploadImage = async (file: File, type: 'avatar' | 'cover') => {
    if (!user) return;

    const maxBytes = type === 'avatar' ? MAX_FILE_SIZES.avatar : MAX_FILE_SIZES.image;
    const validationError = await validateUpload(file, ALLOWED_IMAGE_TYPES, maxBytes);
    if (validationError) {
      toast({ title: "Upload rejected", description: validationError, variant: "destructive" });
      return;
    }

    // Re-encode away EXIF/GPS/device tags before the image leaves the browser.
    const clean = await stripMetadata(file);
    // Extension comes from the MIME type we validated, never from the filename.
    const fileExt = extensionForMime(clean.type) ?? extensionForMime(file.type);
    if (!fileExt) {
      toast({ title: "Upload rejected", description: "That file type is not supported.", variant: "destructive" });
      return;
    }
    const fileName = `${user.id}/${type}-${Date.now()}.${fileExt}`;
    const bucket = type === 'avatar' ? 'avatars' : 'backgrounds';

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, clean, { contentType: clean.type });

    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }

    // Store the object path; readers resolve it to a signed URL via useStorageUrl.
    const updates = type === 'avatar' ? { avatar_url: fileName } : { cover_url: fileName };
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id);

    if (updateError) {
      toast({ title: "Could not save image", variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['profile'] });
    toast({ title: `${type === 'avatar' ? 'Avatar' : 'Cover'} updated` });
  };

  const startEditing = () => {
    setEditedName(profile?.display_name || '');
    setEditedBio(profile?.bio || '');
    setIsEditing(true);
  };

  const trimmedName = editedName.trim();
  const nameMissing = isEditing && trimmedName.length === 0;
  const isDirty = trimmedName !== (profile?.display_name || '') || editedBio.trim() !== (profile?.bio || '');
  const canSave = !nameMissing && isDirty && !updateProfile.isPending;

  const saveChanges = () => {
    if (!canSave) return;
    updateProfile.mutate({ display_name: trimmedName, bio: editedBio.trim() });
  };

  const name = profile?.display_name || profile?.username || "you";

  // Upload affordances: visible on hover/focus on desktop, always visible on phones.
  const revealOnHover =
    "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 ease-soft";

  type CardPost = React.ComponentProps<typeof PostCard>["post"] & {
    likesCount: number;
    commentsCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
  };

  const renderPosts = (
    list: CardPost[] | undefined,
    loading: boolean,
    empty: { title: string; description: string; actionLabel?: string; actionTo?: string },
  ) => {
    if (loading) return <FeedSkeleton count={3} />;
    if (!list || list.length === 0) return <EmptyState {...empty} />;
    return (
      <div className="stagger">
        {list.map((post, idx) => (
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
    );
  };

  return (
    <DashboardLayout>
      <PageHeader title="profile" subtitle="how the room sees you." />

      <input
        ref={coverInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'cover')}
        className="hidden"
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'avatar')}
        className="hidden"
      />

      {loadingProfile ? (
        <ProfileSkeleton />
      ) : (
        <>
          {coverUrl && (
            <div className="px-5 sm:px-8 pb-1">
              <div className="group relative h-[120px] rounded-md overflow-hidden">
                <img src={coverUrl} alt="" className="wallpaper w-full h-full object-cover" />
                <div className="absolute inset-0 bg-background/40 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  aria-label="change cover"
                  className={`quiet absolute bottom-2 right-2 p-2 rounded-md bg-background/50 ${revealOnHover}`}
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="group row px-5 sm:px-8 py-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <UserAvatar avatarUrl={profile?.avatar_url} username={profile?.username} size="lg" />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="change photo"
                  className={`quiet absolute -bottom-1 -right-1 p-1.5 rounded-full bg-background/80 ring-1 ring-foreground/10 ${revealOnHover}`}
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div>
                    <label className="sr-only" htmlFor="profile-name">name</label>
                    <input
                      id="profile-name"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="your name"
                      maxLength={NAME_MAX}
                      autoFocus
                      aria-invalid={nameMissing || undefined}
                      className="field w-full text-[22px] font-extralight tracking-[-0.02em] text-foreground placeholder:text-foreground/30"
                    />
                    {nameMissing ? (
                      <p className="mt-1.5 text-[12px] font-light text-foreground/50">a name is needed.</p>
                    ) : (
                      <p className="mt-1.5 text-[13px] font-light text-foreground/40">@{profile?.username}</p>
                    )}
                    <label className="sr-only" htmlFor="profile-bio">bio</label>
                    <textarea
                      id="profile-bio"
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder="a line about you"
                      maxLength={BIO_MAX}
                      rows={2}
                      className="field mt-3 w-full text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/30 resize-none"
                    />
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <Button variant="signal" size="sm" onClick={saveChanges} disabled={!canSave}>
                        {updateProfile.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        save
                      </Button>
                      <button type="button" onClick={() => setIsEditing(false)} className="quiet text-[13px] px-2 h-9 rounded-md">
                        cancel
                      </button>
                      <span className="mx-1 text-foreground/20">·</span>
                      <button type="button" onClick={() => avatarInputRef.current?.click()} className="quiet text-[13px] px-1 h-9 rounded-md">
                        change photo
                      </button>
                      <button type="button" onClick={() => coverInputRef.current?.click()} className="quiet text-[13px] px-1 h-9 rounded-md">
                        {coverUrl ? "change cover" : "add cover"}
                      </button>
                      <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
                        {editedBio.length}/{BIO_MAX}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 text-[26px] font-extralight leading-tight tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
                        {name}
                      </h2>
                      <button
                        type="button"
                        onClick={startEditing}
                        className="quiet shrink-0 -mr-2 px-2 h-9 rounded-md text-[13px]"
                      >
                        edit
                      </button>
                    </div>
                    <p className="mt-0.5 text-[13px] font-light text-foreground/40">@{profile?.username}</p>
                    {profile?.bio && (
                      <p className="mt-2.5 text-[15px] font-light leading-relaxed text-foreground/85 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {profile.bio}
                      </p>
                    )}
                    <ProfileFacts
                      createdAt={profile?.created_at}
                      location={profile?.location}
                      pronouns={profile?.pronouns}
                      website={profile?.website}
                    />
                    <p className="mt-2 text-[13px] font-light text-foreground/60 tabular-nums">
                      {followStats?.following ?? 0} following
                      <span className="mx-1.5 text-foreground/25">·</span>
                      {followStats?.followers ?? 0} followers
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-5 sm:px-8 pt-2">
              <TabsList className={pillTabsListClass}>
                <TabsTrigger value="posts" className={pillTabsTriggerClass}>posts</TabsTrigger>
                <TabsTrigger value="qa" className={pillTabsTriggerClass}>q&amp;a</TabsTrigger>
                <TabsTrigger value="likes" className={pillTabsTriggerClass}>likes</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="posts" className="mt-0">
              {renderPosts(posts, loadingPosts, {
                title: "nothing posted yet.",
                description: "what you write shows up here, newest first.",
                actionLabel: "write something",
                actionTo: "/dashboard",
              })}
            </TabsContent>

            <TabsContent value="qa" className="mt-0">
              <QAInbox />
            </TabsContent>

            <TabsContent value="likes" className="mt-0">
              {renderPosts(likedPosts, loadingLiked, {
                title: "no likes yet.",
                description: "posts you like are kept here. only you can see this list.",
                actionLabel: "read the feed",
                actionTo: "/dashboard",
              })}
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardLayout>
  );
};

export default Profile;
