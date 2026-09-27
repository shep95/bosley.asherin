DROP POLICY IF EXISTS "Anon can view profiles for preview" ON public.profiles;

CREATE POLICY "Anon can view profiles of public authors"
ON public.profiles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.user_id = profiles.user_id
      AND p.visibility = 'public'
  )
);