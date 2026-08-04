-- Migration 038: no-cost extension history.
--
-- Each row records one no-cost extension granted on a project: how many months
-- were added, plus a snapshot of the duration before and after so the log stays
-- self-contained even if the project duration is later edited directly. An
-- optional note captures the reason. projects.project_duration_months remains
-- the single source of truth for the total period (budgets, workplan, Gantt all
-- derive from it); this table is the audit trail of how it grew.
-- Cascade-deleted with the project.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS project_extensions (
    id                        SERIAL       PRIMARY KEY,
    project_id                INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    months_added              INTEGER      NOT NULL CHECK (months_added > 0),
    previous_duration_months  INTEGER      NOT NULL,   -- duration before this extension
    new_duration_months       INTEGER      NOT NULL,   -- duration after this extension
    note                      TEXT,                    -- optional reason
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_extensions_project_id_idx ON project_extensions(project_id);
