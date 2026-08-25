-- db/roles.sql
-- Application and admin roles for the CRAF'd reporting platform.
--
-- The running app must NOT connect as a database admin/owner. This provisions
-- `prism_app`: a LOGIN role that can only run DML (SELECT / INSERT / UPDATE /
-- DELETE) inside the `reporting_platform` schema — no DDL, no other schemas, not
-- a superuser, cannot create roles or databases.
--
-- It also provisions `prism_admin`: a LOGIN role for humans/tools that need to
-- manage the schema day-to-day (DDL included) and manage `prism_app`, without
-- handing out full database-superuser/createdb rights. `prism_admin` becomes
-- the OWNER of the `reporting_platform` schema and all its objects (see step 7),
-- so schema creation and migrations can run under `prism_admin` from here on —
-- see the note at step 7 before re-running this file.
--
-- Set both passwords in steps 2 and 9 below, then run ONCE as the CURRENT
-- schema owner / admin (the SAME account that applies db/schema.sql), AFTER
-- the schema and tables exist:
--
--   psql "<ADMIN connection string>" -f db/roles.sql
--
-- Then point the app's AZURE_POSTGRES_USER / AZURE_POSTGRES_PASSWORD at
-- prism_app (see README), and use prism_admin for schema/DDL work and for
-- managing prism_app going forward. Safe to re-run after any schema change: it
-- is idempotent and back-fills privileges on existing objects — but see the
-- step 7 note about who must run it after the first run.
--
-- SECURITY: once you fill these in, the file holds real credentials. Do NOT
-- commit the filled values — set them at deploy time and treat this file as a
-- secret (or rotate the passwords afterwards).
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
--    Includes expenditure_budget_category_notes (added in add-budget-category-notes.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA reporting_platform TO prism_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA reporting_platform TO prism_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA reporting_platform TO prism_app;

-- 5. Grant the same automatically on objects created by FUTURE schema changes.
--    Default privileges attach to the role that runs this script, so run this
--    file and db/schema.sql as the same owner/admin account.
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO prism_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT USAGE, SELECT                  ON SEQUENCES TO prism_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT EXECUTE                        ON FUNCTIONS TO prism_app;

-- 6. Pin the role's search_path to the app schema (defense in depth; the app
--    also fully-qualifies every table as reporting_platform.<table>).
ALTER ROLE prism_app SET search_path = reporting_platform, public;


-- ─────────────────────────────────────────────────────────────────────────
-- prism_admin — schema-admin role. Can DDL + DML anything in
-- reporting_platform, and manage (only) prism_app: rotate its password,
-- change its attributes, grant/revoke its membership. Still not a database
-- superuser and cannot touch other schemas or other roles.
-- ─────────────────────────────────────────────────────────────────────────

-- 7. The login role. CREATEROLE is required for PostgreSQL to let it alter
--    prism_app at all; the ADMIN OPTION grant below (step 10) then restricts
--    that CREATEROLE power to prism_app only, not to every non-superuser role
--    cluster-wide (Postgres 16+ semantics).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prism_admin') THEN
    CREATE ROLE prism_admin LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
  END IF;
END$$;

-- 8. May connect to this database and use the app schema — nothing else.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO prism_admin', current_database());
END$$;
GRANT USAGE, CREATE ON SCHEMA reporting_platform TO prism_admin;
REVOKE ALL           ON SCHEMA public             FROM prism_admin;  -- no foothold in public

-- 9. Set / rotate the password — replace the literal below before running.
ALTER ROLE prism_admin PASSWORD '<REPLACE WITH STRONG PASSWORD>';

-- 10. Ownership transfer — this is what actually gives prism_admin the power
--     to ALTER/DROP objects that already exist (GRANT alone only covers DML
--     and creating NEW objects; altering/dropping an existing object requires
--     being its owner or a member of the owning role).
--
--     REASSIGN OWNED BY CURRENT_USER reassigns EVERY object owned by the
--     CURRENT (connecting) role IN THIS DATABASE — it is not scoped to
--     reporting_platform. Before running this file, confirm the connecting
--     admin account does not own objects you don't want handed to
--     prism_admin, e.g. by checking:
--
--       SELECT n.nspname, c.relname, c.relkind
--       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE c.relowner = current_user::regrole;
--
--     After this runs, the ORIGINAL admin account no longer owns the schema
--     or its objects — prism_admin does. Any future re-run of this file, or
--     of db/schema.sql / migrations, must therefore be run AS prism_admin
--     (or another role that is a member of prism_admin), not as the original
--     admin account, or ALTER/CREATE on existing objects will fail.
REASSIGN OWNED BY CURRENT_USER TO prism_admin;

-- 11. Belt-and-braces explicit grants (harmless once prism_admin owns the
--     objects via step 10; keeps this idempotent/self-healing if step 10 is
--     ever skipped, or for objects owned by some other role).
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA reporting_platform TO prism_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA reporting_platform TO prism_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA reporting_platform TO prism_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT ALL PRIVILEGES ON TABLES    TO prism_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT ALL PRIVILEGES ON SEQUENCES TO prism_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting_platform
  GRANT ALL PRIVILEGES ON FUNCTIONS TO prism_admin;

-- 12. Manage prism_app: ADMIN OPTION lets prism_admin alter prism_app's
--     password/attributes and grant/revoke its membership — scoped to
--     prism_app only, not a general CREATEROLE over every role.
GRANT prism_app TO prism_admin WITH ADMIN OPTION;

-- 13. Pin the role's search_path to the app schema (defense in depth; DDL
--     work should still fully-qualify objects as reporting_platform.<name>).
ALTER ROLE prism_admin SET search_path = reporting_platform, public;
