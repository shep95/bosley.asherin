-- Add message_requests_enabled setting to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS message_requests_enabled boolean DEFAULT true;

-- Add message_wallpaper_url to profiles for premium users
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS message_wallpaper_url text;

-- Create message_reactions table for emoji reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on message_reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Policies for message_reactions
CREATE POLICY "Users can view reactions on their messages"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.id = message_id 
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can add reactions to messages they can see"
ON public.message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.id = message_id 
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Add reply_to_id to messages for reply functionality
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- Update messages RLS to allow receivers to delete messages from their view
DROP POLICY IF EXISTS "Users can delete their own sent messages" ON public.messages;

CREATE POLICY "Users can delete messages in their conversations"
ON public.messages FOR DELETE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);