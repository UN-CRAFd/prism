-- Monthly package & security check results
--
-- One row per run of scripts/security-check.mjs (scheduled monthly by
-- .github/workflows/monthly-security-check.yml, or run by hand). The script
-- sends the package results (npm audit / outdated); the app adds the platform
-- checks it runs itself (secrets, database safeguards) and stores the
-- combined report here. The admin "Security" page shows the latest run, what
-- needs immediate action, and the history.
--
--   status  'ok' | 'attention' | 'action'   (worst finding of the run)
--   report  the full report (JSON): packages, platform checks, actions
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-security-checks.sql

CREATE TABLE IF NOT EXISTS reporting_platform.security_checks (
    id       SERIAL       PRIMARY KEY,
    run_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    source   TEXT         NOT NULL DEFAULT 'script',  -- 'scheduled' | 'manual' | …
    status   TEXT         NOT NULL CHECK (status IN ('ok', 'attention', 'action')),
    report   JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS security_checks_run_at_idx
    ON reporting_platform.security_checks (run_at DESC);

-- The app only ever adds runs and reads them.
GRANT SELECT, INSERT ON reporting_platform.security_checks TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE reporting_platform.security_checks_id_seq TO prism_app;
