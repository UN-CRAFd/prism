-- Login protection: limit password guesses
--
-- One row per throttled key, e.g. 'login:partner:12' (a partner account; the
-- login page and the share-link page share it), 'login:name:<username>' (a
-- username that matches no account) or 'login:admin'. After 5 failed password
-- attempts a partner key stays locked until a new password is issued; the
-- admin key is locked for 15 minutes. A successful login clears the key. Rows
-- hold no passwords, only the counter and the lock time.
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
