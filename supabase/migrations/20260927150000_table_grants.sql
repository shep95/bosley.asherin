-- Table privileges for the API roles.
-- On this project the tables were created with default privileges that gave
-- authenticated/service_role only TRUNCATE/REFERENCES/TRIGGER, so every
-- PostgREST request returned 403 even though the RLS policies allowed it.
-- RLS is the access control; these grants just let the roles reach the tables.
-- anon deliberately receives nothing here (see 20260927000000): signed-out
-- traffic uses the three explicitly granted RPCs only.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
