-- Create profiles table with encrypted fields
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for username lookups
CREATE UNIQUE INDEX idx_profiles_username_lower ON public.profiles (LOWER(username));

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create posts table
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Posts policies
CREATE POLICY "Posts are viewable by authenticated users" 
ON public.posts 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can create their own posts" 
ON public.posts 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts" 
ON public.posts 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts" 
ON public.posts 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Create messages table for private messaging
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS for messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages policies - only sender and receiver can see
CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" 
ON public.messages 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own sent messages" 
ON public.messages 
FOR DELETE 
TO authenticated
USING (auth.uid() = sender_id);

-- Blocked/disposable email domains table
CREATE TABLE public.blocked_email_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert common disposable email domains
INSERT INTO public.blocked_email_domains (domain) VALUES
  ('tempmail.com'),
  ('throwaway.email'),
  ('guerrillamail.com'),
  ('guerrillamail.org'),
  ('10minutemail.com'),
  ('mailinator.com'),
  ('temp-mail.org'),
  ('fakeinbox.com'),
  ('trashmail.com'),
  ('yopmail.com'),
  ('sharklasers.com'),
  ('getnada.com'),
  ('maildrop.cc'),
  ('dispostable.com'),
  ('tempail.com'),
  ('throwawaymail.com'),
  ('mohmal.com'),
  ('emailondeck.com'),
  ('tempr.email'),
  ('discard.email');

-- Function to check if email domain is blocked
CREATE OR REPLACE FUNCTION public.is_email_domain_blocked(email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  email_domain TEXT;
BEGIN
  email_domain := LOWER(SPLIT_PART(email, '@', 2));
  RETURN EXISTS (SELECT 1 FROM public.blocked_email_domains WHERE domain = email_domain);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to check if username is taken
CREATE OR REPLACE FUNCTION public.is_username_taken(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(check_username));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
BEFORE UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();