-- 033_project_narratives.sql
-- Project-level narrative texts for the project document (proposal narratives:
-- Background & Relevance, Theory of Change, CRAF'd Principles, Methodology, etc.).
-- Stored as one row per (project, narrative_key) rather than wide columns on
-- `projects`, so the question set can evolve in code without schema changes.
-- The human-readable question label lives in labels.json, keyed by narrative_key.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS project_narratives (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    narrative_key TEXT         NOT NULL,
    answer        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, narrative_key)
);
CREATE INDEX IF NOT EXISTS project_narratives_project_idx ON project_narratives(project_id);
DROP TRIGGER IF EXISTS project_narratives_updated_at ON project_narratives;
CREATE TRIGGER project_narratives_updated_at
    BEFORE UPDATE ON project_narratives
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
