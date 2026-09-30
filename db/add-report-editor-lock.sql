-- Report editor lock: one row per report, same design as prodoc_editor_locks
-- (see add-editor-lock.sql). report_id as PRIMARY KEY enforces one lock per
-- report. last_seen_at is kept current by the heartbeat.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS report_editor_locks (
    report_id     INTEGER      PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
    session_id    TEXT         NOT NULL,
    holder_name   TEXT         NOT NULL,
    holder_role   TEXT         NOT NULL,
    acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE report_editor_locks TO prism_app;
