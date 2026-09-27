-- Performance pass driven by the Supabase advisor:
--  1. Overlapping permissive SELECT policies merged into one per role/table.
--  2. Duplicate index removed.
--  3. Every policy that calls auth.uid()/auth.role()/auth.jwt() per row is
--     rewritten to (select auth.fn()) so the value is computed once per query.
--  4. Every foreign key without a supporting index gets one.
-- Idempotent: re-running finds nothing left to rewrite.

-- 1. Merge overlapping SELECT policies -------------------------------------
DROP POLICY IF EXISTS "Public answers visible to authenticated" ON public.anonymous_questions;
DROP POLICY IF EXISTS "Recipients can view their questions" ON public.anonymous_questions;
CREATE POLICY "Recipients see their questions, everyone sees public answers"
ON public.anonymous_questions FOR SELECT TO authenticated
USING (
  (select auth.uid()) = recipient_user_id
  OR (is_public = true AND answered_at IS NOT NULL)
);

DROP POLICY IF EXISTS "Poll authors can view votes on their polls" ON public.poll_votes;
DROP POLICY IF EXISTS "Users can view their own poll votes" ON public.poll_votes;
CREATE POLICY "Voters see their vote, poll authors see all votes"
ON public.poll_votes FOR SELECT TO authenticated
USING (
  (select auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.polls pl
    JOIN public.posts p ON p.id = pl.post_id
    WHERE pl.id = poll_votes.poll_id AND p.user_id = (select auth.uid())
  )
);

-- user_verifications: one SELECT policy, admin writes split per command.
DROP POLICY IF EXISTS "Public badge fields readable when active" ON public.user_verifications;
DROP POLICY IF EXISTS "Owners and admins see full verification rows" ON public.user_verifications;
DROP POLICY IF EXISTS "Admins can manage verifications" ON public.user_verifications;
CREATE POLICY "Owners and admins see verification rows"
ON public.user_verifications FOR SELECT TO authenticated
USING ((select auth.uid()) = user_id OR public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins insert verifications"
ON public.user_verifications FOR INSERT TO authenticated
WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins update verifications"
ON public.user_verifications FOR UPDATE TO authenticated
USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins delete verifications"
ON public.user_verifications FOR DELETE TO authenticated
USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- user_roles: same split.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Users see their roles, admins see all"
ON public.user_roles FOR SELECT TO authenticated
USING ((select auth.uid()) = user_id OR public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Admins delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- 2. Duplicate index ---------------------------------------------------------
DROP INDEX IF EXISTS public.idx_anon_questions_recipient_created;

-- 3. auth.<fn>() -> (select auth.<fn>()) in every remaining policy ------------
DO $$
DECLARE
  r record;
  q text;
  w text;
  role_list text;
  stmt text;
BEGIN
  FOR r IN
    SELECT *
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (
         (qual ~ 'auth\.(uid|role|jwt)\(\)' AND qual !~ 'SELECT auth\.')
         OR (with_check ~ 'auth\.(uid|role|jwt)\(\)' AND with_check !~ 'SELECT auth\.')
       )
  LOOP
    q := regexp_replace(r.qual, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    w := regexp_replace(r.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                   r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, role_list);
    IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
    IF w IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', w); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- 4. Index every foreign key that lacks one -----------------------------------
DO $$
DECLARE
  r record;
  cols text;
  idxname text;
BEGIN
  FOR r IN
    SELECT c.conrelid, cl.relname, c.conkey
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f'
       AND n.nspname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND i.indkey[0] = c.conkey[1]
       )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord),
           string_agg(a.attname, '_' ORDER BY k.ord)
      INTO cols, idxname
      FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.attnum;
    idxname := left('idx_' || r.relname || '_' || idxname, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', idxname, r.relname, cols);
  END LOOP;
END $$;
