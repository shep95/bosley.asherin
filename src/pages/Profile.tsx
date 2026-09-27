import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stripMetadata } from "@/lib/mediaSanitize";
import { validateUpload, extensionForMime, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES } from "@/lib/sanitize";
import { useStorageUrl } from "@/lib/storageUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Camera, Edit2, Loader2, 
  Calendar, Check, X, MessageSquare, Heart, HelpCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QAInbox from "@/components/qa/QAInbox";
import PageHeader from "@/components/layout/PageHeader";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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
        .select('user_id, username, display_name, avatar_url, cover_url, bio, created_at')
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
      toast({ title: "Profile updated" });
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

  const saveChanges = () => {
    updateProfile.mutate({ display_name: editedName, bio: editedBio });
  };

  const handleMessageUser = () => {
    navigate('/messages');
  };

  if (loadingProfile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
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
          statusLabel={profile?.username ? `@${profile.username}` : "Your profile"}
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
          <input
            ref={coverInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'cover')}
            className="hidden"
          />
          <button
            onClick={() => coverInputRef.current?.click()}
            className="absolute bottom-3 right-3 bg-background/60 backdrop-blur-md border border-foreground/10 rounded-lg p-2 text-foreground/70 hover:text-foreground transition-colors"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>

        {/* Profile info */}
        <div className="px-4">
          <div className="relative -mt-16 mb-4">
            <UserAvatar
              avatarUrl={profile?.avatar_url}
              username={profile?.username}
              size="xl"
              className="ring-4 ring-background"
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'avatar')}
              className="hidden"
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-1 left-20 sm:left-24 glass-inset rounded-full p-2 text-foreground/60 hover:text-foreground"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3 max-w-sm">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Display name"
                    className="bg-background/50 border-border/50 rounded-lg font-light"
                  />
                  <Textarea
                    value={editedBio}
                    onChange={(e) => setEditedBio(e.target.value)}
                    placeholder="Bio"
                    className="bg-background/50 border-border/50 rounded-lg font-light resize-none"
                    maxLength={160}
                  />
                  <div className="flex gap-2">
                    <Button 
                      onClick={saveChanges} 
                      size="sm" 
                      className="rounded-lg bg-foreground text-background"
                      disabled={updateProfile.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button 
                      onClick={() => setIsEditing(false)} 
                      size="sm" 
                      variant="ghost" 
                      className="rounded-lg"
                    >
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
            
            {!isEditing && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleMessageUser}
                  variant="ghost" 
                  size="icon"
                  className="rounded-lg"
                >
                  <MessageSquare className="w-5 h-5" />
                </Button>
                <Button 
                  onClick={startEditing} 
                  variant="ghost" 
                  className="rounded-lg font-light"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={pillTabsListClass}>
              <TabsTrigger value="posts" className={pillTabsTriggerClass}>Posts</TabsTrigger>
              <TabsTrigger value="qa" className={pillTabsTriggerClass}>
                <HelpCircle className="w-3.5 h-3.5" /> Q&A
              </TabsTrigger>
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
                    No posts yet. Share your first thought!
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="qa" className="mt-4">
              <QAInbox />
            </TabsContent>

            <TabsContent value="likes" className="mt-4">
              {loadingLiked ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                </div>
              ) : likedPosts && likedPosts.length > 0 ? (
                <div className="space-y-4">
                  {likedPosts.map((post: any) => (
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
                  <p className="text-foreground/60 font-light">No liked posts yet.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;