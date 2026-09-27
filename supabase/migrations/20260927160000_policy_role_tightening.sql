-- Defence in depth after the database audit.
--  1. Every policy still addressed to PUBLIC (i.e. anon too) is narrowed to
--     authenticated. anon has no table privileges, so this changes nothing
--     today; it guarantees a future GRANT to anon cannot silently open a
--     write path through an old policy.
--  2. The blanket table grant also gave authenticated write privileges on
--     views. Views are read surfaces; drop everything but SELECT.
--  3. Supabase's own rls_auto_enable() event-trigger function was executable
--     through /rpc by anon; nothing legitimate calls it over HTTP.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public' AND roles = '{public}'::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated, service_role, anon', r.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', r.table_name);
  END LOOP;
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'rls_auto_enable not adjustable: %', SQLERRM;
END $$;
