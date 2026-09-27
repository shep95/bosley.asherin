import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Loader2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/layout/PageHeader";

const Bookmarks = () => {
  const { user } = useAuth();

  const { data: bookmarkedPosts, isLoading } = useQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get bookmarks
      const { data: bookmarks } = await supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (!bookmarks || bookmarks.length === 0) return [];

      const postIds = bookmarks.map(b => b.post_id);

      // Get posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .in('id', postIds);
      
      if (!postsData) return [];

      // Fetch profiles
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);
      
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      // Fetch likes counts
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);
      
      const likesCountMap = new Map<string, number>();
      likesData?.forEach(l => {
        likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1);
      });

      // Check if user liked
      const { data: userLikes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      
      const userLikedSet = new Set(userLikes?.map(l => l.post_id) || []);

      // Fetch comments counts
      const { data: commentsData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);
      
      const commentsCountMap = new Map<string, number>();
      commentsData?.forEach(c => {
        commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1);
      });

      // Sort by bookmark order
      const postMap = new Map(postsData.map(p => [p.id, p]));
      return postIds.map(id => {
        const post = postMap.get(id);
        if (!post) return null;
        return {
          ...post,
          profiles: profilesMap.get(post.user_id) || null,
          likesCount: likesCountMap.get(post.id) || 0,
          commentsCount: commentsCountMap.get(post.id) || 0,
          isLiked: userLikedSet.has(post.id),
          isBookmarked: true,
        };
      }).filter(Boolean);
    },
    enabled: !!user
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <PageHeader
          title="Bookmarks"
          statusDot="bg-foreground/40"
          statusLabel={
            bookmarkedPosts && bookmarkedPosts.length > 0
              ? `${bookmarkedPosts.length} saved post${bookmarkedPosts.length === 1 ? '' : 's'}`
              : "Saved posts live here"
          }
        />

        <div className="px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
          </div>
        ) : bookmarkedPosts && bookmarkedPosts.length > 0 ? (
          <div className="space-y-4">
            {bookmarkedPosts.map((post: any) => (
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
          <EmptyState
            icon={Bookmark}
            title="No bookmarks yet"
            description="Tap the bookmark icon on any post to keep it here, private to you."
            actionLabel="Browse the feed"
            actionTo="/dashboard"
          />
        )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Bookmarks;
