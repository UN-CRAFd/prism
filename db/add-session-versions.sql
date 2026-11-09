-- Log people out when a password changes
--
-- Every login carries the account's "session version". Changing or resetting a
-- password increases the version, so every login issued before the change stops
-- working at once — on every device of a shared account — instead of staying
-- valid until it expires (up to 30 days).
--
--   • partners.session_version — per partner account (this migration)
--   • the shared admin account keeps its version in app_settings
--     (key 'admin_session_version'); no schema change is needed for it.
--
-- Optional for the app code: until this has run, partner logins keep working
-- but are not revoked on a password change. The check is cached at module load,
-- so restart the app afterwards.
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-session-versions.sql

ALTER TABLE reporting_platform.partners
    ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
