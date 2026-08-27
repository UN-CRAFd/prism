-- Prodoc editor lock: one row per project, identifying who currently holds the
-- edit session. project_id as PRIMARY KEY enforces one lock per project at the
-- DB level — no application-level uniqueness logic needed.
--
-- session_id is a caller-supplied opaque token that distinguishes concurrent
-- browser sessions from the same login (e.g. a UUID minted at login and stored
-- in the session cookie alongside the existing payload fields).
--
-- last_seen_at is kept current by the heartbeat route. There is no updated_at
-- trigger — last_seen_at is the only mutable timestamp and is written explicitly
-- by the heartbeat, not by a generic trigger.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS prodoc_editor_locks (
    project_id    INTEGER      PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    session_id    TEXT         NOT NULL,
    holder_name   TEXT         NOT NULL,
    holder_role   TEXT         NOT NULL,
    acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE prodoc_editor_locks TO prism_app;
