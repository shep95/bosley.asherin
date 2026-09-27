-- Add owner_email column to profiles to identify the owner
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_email text DEFAULT NULL;

-- Fix security: Profiles should only be viewable by authenticated users
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users" 
ON public.profiles 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Fix security: Users should not be able to read post_flags at all (admin only)
-- RLS is already enabled, just ensuring no SELECT policy exists
-- The existing INSERT policy is fine