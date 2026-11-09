-- Login protection: limit password guesses
--
-- One row per throttled key, e.g. 'login:acled' (password login by username),
-- 'magic:12' (share-link password for partner 12) or 'forgot:acled' (forgot-
-- password requests). After 5 failed password attempts the key is locked for
-- 15 minutes; a successful login clears it. Rows hold no passwords, only the
-- counter and the lock time.
--
-- The CRAF'd address that "Forgot password" requests are sent to is stored in
-- the existing app_settings table (key 'support_email'), set on the admin
-- Settings page — no schema change is needed for it.
--
-- Optional for the app code: until this has run, logins work but are not
-- limited. The check is cached at module load, so restart the app afterwards.
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-login-attempts.sql

CREATE TABLE IF NOT EXISTS reporting_platform.login_attempts (
    key             TEXT         PRIMARY KEY,
    failures        INTEGER      NOT NULL DEFAULT 0,
    last_failed_at  TIMESTAMPTZ,
    locked_until    TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON reporting_platform.login_attempts TO prism_app;
