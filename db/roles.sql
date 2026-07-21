-- db/roles.sql
-- Least-privilege application role for the CRAF'd reporting platform.
--
-- The running app must NOT connect as a database admin/owner. This provisions
-- `prism_app`: a LOGIN role that can only run DML (SELECT / INSERT / UPDATE /
-- DELETE) inside the `reporting_platform` schema — no DDL, no other schemas, not
-- a superuser, cannot create roles or databases. Schema creation and migrations
-- keep running under the owner/admin account; the app never does.
--
-- Set the password in step 2 below, then run ONCE as the schema owner / admin
-- (the SAME account that applies db/ and migrations/), AFTER the schema and
-- tables exist:
--
--   psql "<ADMIN connection string>" -f db/roles.sql
--
-- Then point the app's AZURE_POSTGRES_USER / AZURE_POSTGRES_PASSWORD at
-- prism_app (see README). Safe to re-run after new migrations: it is idempotent
-- and back-fills privileges on existing objects.
--
-- SECURITY: once you fill this in, the file holds a real credential. Do NOT
-- commit the filled value — set it at deploy time and treat this file as a
-- secret (or rotate the password afterwards).
--
-- Plain SQL — run it however you connect (psql, a GUI client such as
-- DBeaver/pgAdmin, or the Azure query editor). No psql-specific commands.

SET search_path TO reporting_platform, public;

-- 1. The login role. Explicitly stripped of every elevated attribute.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prism_app') THEN
    CREATE ROLE prism_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END$$;

-- 2. Set / rotate the password — replace the literal below before running.
ALTER ROLE prism_app PASSWORD '<REPLACE WITH STRONG PASSWORD>';

-- 3. May connect to this database and use the app schema — nothing else.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO prism_app', current_database());
END$$;
GRANT USAGE  ON SCHEMA reporting_platform TO prism_app;
REVOKE CREATE ON SCHEMA reporting_platform FROM prism_app;  -- no DDL in the app schema
REVOKE ALL    ON SCHEMA public             FROM prism_app;  -- no foothold in public

-- 4. DML on every existing object. SERIAL primary keys require sequence USAGE;
--    the updated_at triggers require EXECUTE on set_updated_at().
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA reporting_platform TO prism_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA reporting_platform TO prism_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA reporting_platform TO prism_app;

-- 5. Grant the same automatically on objects created by FUTURE migrations.
--    Default privileges attach to the role that runs this script, so run this
--    file and all migrations as the same owner/admin account.
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO prism_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT USAGE, SELECT                  ON SEQUENCES TO prism_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT EXECUTE                        ON FUNCTIONS TO prism_app;

-- 6. Pin the role's search_path to the app schema (defense in depth; the app
--    also fully-qualifies every table as reporting_platform.<table>).
ALTER ROLE prism_app SET search_path = reporting_platform, public;
