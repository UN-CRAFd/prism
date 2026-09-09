-- Version log: one row per status transition on a report, prodoc or project.
-- Append-only — the app never updates or deletes these rows.
-- Snapshot column is reserved for submission entries; unused for now.
CREATE TABLE IF NOT EXISTS reporting_platform.version_log (
    id            SERIAL       PRIMARY KEY,
    entity_type   TEXT         NOT NULL,
    entity_id     INTEGER      NOT NULL,
    entity_label  TEXT,
    project_id    INTEGER      NOT NULL REFERENCES reporting_platform.projects(id) ON DELETE CASCADE,
    from_status   TEXT,
    to_status     TEXT         NOT NULL,
    actor_role    TEXT         NOT NULL,
    actor_org     TEXT,
    actor_name    TEXT,
    reason        TEXT,
    snapshot      JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS version_log_project_id_idx
    ON reporting_platform.version_log(project_id);
CREATE INDEX IF NOT EXISTS version_log_entity_idx
    ON reporting_platform.version_log(entity_type, entity_id);

GRANT SELECT, INSERT ON reporting_platform.version_log TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE reporting_platform.version_log_id_seq TO prism_app;