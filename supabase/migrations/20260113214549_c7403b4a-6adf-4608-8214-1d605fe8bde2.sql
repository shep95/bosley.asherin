-- Create storage buckets for all media types
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('post-media', 'post-media', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', false);

-- Avatars bucket policies (public read, authenticated write to own folder)
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Post media bucket policies (public read, authenticated write to own folder)
CREATE POLICY "Post media is publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'post-media');

CREATE POLICY "Users can upload their own post media" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own post media" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Backgrounds bucket policies (public read, premium users can upload)
CREATE POLICY "Background images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'backgrounds');

CREATE POLICY "Premium users can upload backgrounds" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own backgrounds" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Files bucket policies (private - only owner can access)
CREATE POLICY "Users can view their own files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add custom_background_url to profiles for premium users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_background_url text DEFAULT NULL;

-- Create group_chats table
CREATE TABLE public.group_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_chat_members table
CREATE TABLE public.group_chat_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create group_messages table
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Group chats policies
CREATE POLICY "Users can view groups they are members of" 
ON public.group_chats FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = id AND user_id = auth.uid()));

CREATE POLICY "Authenticated users can create groups" 
ON public.group_chats FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups" 
ON public.group_chats FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = id AND user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Group admins can delete groups" 
ON public.group_chats FOR DELETE 
USING (auth.uid() = created_by);

-- Group members policies
CREATE POLICY "Users can view members of their groups" 
ON public.group_chat_members FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.group_chat_members gcm WHERE gcm.group_id = group_id AND gcm.user_id = auth.uid()));

CREATE POLICY "Admins can add members" 
ON public.group_chat_members FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_chat_members.group_id AND user_id = auth.uid() AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.group_chats WHERE id = group_chat_members.group_id AND created_by = auth.uid())
);

CREATE POLICY "Admins can remove members" 
ON public.group_chat_members FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_chat_members.group_id AND user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
);

-- Group messages policies
CREATE POLICY "Users can view messages in their groups" 
ON public.group_messages FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_messages.group_id AND user_id = auth.uid()));

CREATE POLICY "Members can send messages" 
ON public.group_messages FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id 
  AND EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())
);

CREATE POLICY "Users can delete their own messages" 
ON public.group_messages FOR DELETE 
USING (auth.uid() = sender_id);

-- Enable realtime for messages and group_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;