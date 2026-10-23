#!/bin/sh
set -eu
: "${POSTGRES_MIGRATOR_PASSWORD:?Migration password is required}"
: "${POSTGRES_APP_PASSWORD:?Application password is required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=db="$POSTGRES_DB" \
  --set=migrator_password="$POSTGRES_MIGRATOR_PASSWORD" \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE gemukore_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migrator_password';
CREATE ROLE gemukore_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE :"db" OWNER TO gemukore_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO gemukore_app;
ALTER SCHEMA public OWNER TO gemukore_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gemukore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gemukore_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gemukore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gemukore_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gemukore_app;
SQL
