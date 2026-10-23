\set ON_ERROR_STOP on
SET ROLE gemukore_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gemukore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gemukore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemukore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gemukore_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gemukore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gemukore_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gemukore_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM gemukore_app;
-- Recovery keeps identities/grants but requires every restored user to sign in again.
DELETE FROM session;
ANALYZE;
