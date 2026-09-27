-- Add new fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cover_url TEXT,
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER DEFAULT 10;

-- Add new fields to posts
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_thread BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS thread_id UUID,
ADD COLUMN IF NOT EXISTS thread_position INTEGER,
ADD COLUMN IF NOT EXISTS is_long_form BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS topic_id UUID,
ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- Post edit history
CREATE TABLE public.post_edits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  edited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.post_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post edits are viewable by everyone" 
ON public.post_edits FOR SELECT USING (true);

CREATE POLICY "Users can create edits for their own posts" 
ON public.post_edits FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
);

-- Topics/Communities
CREATE TABLE public.topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Topics are viewable by everyone" ON public.topics FOR SELECT USING (true);

-- Insert default topics
INSERT INTO public.topics (name, slug, description, icon, color) VALUES
  ('Technology', 'tech', 'Tech news, startups, and innovation', '💻', '#3B82F6'),
  ('Politics', 'politics', 'Political discussions and news', '🏛️', '#EF4444'),
  ('Sports', 'sports', 'Sports news and discussions', '⚽', '#22C55E'),
  ('Music', 'music', 'Music discussions and discoveries', '🎵', '#A855F7'),
  ('Gaming', 'gaming', 'Video games and gaming culture', '🎮', '#F59E0B'),
  ('Science', 'science', 'Scientific discoveries and discussions', '🔬', '#06B6D4'),
  ('Art', 'art', 'Art, design, and creativity', '🎨', '#EC4899'),
  ('Finance', 'finance', 'Markets, crypto, and money', '💰', '#10B981');

-- User follows
CREATE TABLE public.follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are viewable by everyone" 
ON public.follows FOR SELECT USING (true);

CREATE POLICY "Users can follow others" 
ON public.follows FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" 
ON public.follows FOR DELETE 
TO authenticated
USING (auth.uid() = follower_id);

-- Post likes
CREATE TABLE public.post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone" 
ON public.post_likes FOR SELECT USING (true);

CREATE POLICY "Users can like posts" 
ON public.post_likes FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike" 
ON public.post_likes FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Bookmarks/Collections
CREATE TABLE public.collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public collections viewable by everyone" 
ON public.collections FOR SELECT 
USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can create collections" 
ON public.collections FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their collections" 
ON public.collections FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their collections" 
ON public.collections FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Bookmarks
CREATE TABLE public.bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their bookmarks" 
ON public.bookmarks FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can bookmark posts" 
ON public.bookmarks FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove bookmarks" 
ON public.bookmarks FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Post flags (engagement bait)
CREATE TABLE public.post_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can flag posts" 
ON public.post_flags FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- User settings
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_mode TEXT DEFAULT 'chronological',
  show_politics BOOLEAN DEFAULT true,
  show_viral BOOLEAN DEFAULT true,
  hide_insults BOOLEAN DEFAULT false,
  hide_political_arguments BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their settings" 
ON public.user_settings FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their settings" 
ON public.user_settings FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their settings" 
ON public.user_settings FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Topic subscriptions
CREATE TABLE public.topic_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_id)
);

ALTER TABLE public.topic_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their subscriptions" 
ON public.topic_subscriptions FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can subscribe to topics" 
ON public.topic_subscriptions FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update subscriptions" 
ON public.topic_subscriptions FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can unsubscribe" 
ON public.topic_subscriptions FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Comments on posts
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by authenticated users" 
ON public.comments FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can create comments" 
ON public.comments FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their comments" 
ON public.comments FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their comments" 
ON public.comments FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();