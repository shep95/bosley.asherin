CREATE OR REPLACE FUNCTION public.is_community_member(_community_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_public_community(_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities
    WHERE id = _community_id AND is_private = false
  )
$$;

DROP POLICY IF EXISTS "Public communities visible" ON public.communities;
CREATE POLICY "Public communities visible"
ON public.communities
FOR SELECT
USING (is_private = false OR public.is_community_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members can view community members" ON public.community_members;
CREATE POLICY "Members can view community members"
ON public.community_members
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_public_community(community_id)
  OR public.is_community_member(community_id, auth.uid())
);

GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_public_community(uuid) TO authenticated, anon;