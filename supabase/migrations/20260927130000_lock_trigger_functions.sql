-- Trigger functions are SECURITY DEFINER and were EXECUTE-able by anon and
-- authenticated through PostgREST's /rpc. They can only run as triggers, but
-- the grant is noise the Supabase security advisor rightly flags. Revoke it
-- from every trigger-returning function in public, now and for any added later.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
