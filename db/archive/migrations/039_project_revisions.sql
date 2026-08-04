-- Migration 039: project revision history.
--
-- A project revision is a logged event — the project was revised on a given date
-- for a stated reason. Unlike a no-cost extension it changes nothing derived
-- (no period, budget or workplan impact); it is purely an audit record.
-- Cascade-deleted with the project.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS project_revisions (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision_date DATE         NOT NULL,
    comment       TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_revisions_project_id_idx ON project_revisions(project_id);
