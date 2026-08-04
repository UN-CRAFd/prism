-- 040_project_sdg_targets.sql
-- SDG Target focus for the project document. A project selects one or more SDG
-- targets (sub-indicators of goals 1–17) and assigns each a focus percentage;
-- the percentages are intended to sum to 100% across the project (a soft rule
-- enforced in the UI, not the DB, so partially-edited states remain storable).
--
-- Project-level (keyed by project_id) and shared by both the admin and partner
-- sides, mirroring project_narratives. The goal/target catalogue lives in code
-- (src/lib/sdg.ts), so target_code is stored free-form and the schema never
-- needs to change as the catalogue evolves.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS project_sdg_targets (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sdg_goal     SMALLINT     NOT NULL CHECK (sdg_goal BETWEEN 1 AND 17),
    target_code  TEXT         NOT NULL,
    percentage   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, target_code)
);
CREATE INDEX IF NOT EXISTS project_sdg_targets_project_idx ON project_sdg_targets(project_id);
DROP TRIGGER IF EXISTS project_sdg_targets_updated_at ON project_sdg_targets;
CREATE TRIGGER project_sdg_targets_updated_at
    BEFORE UPDATE ON project_sdg_targets
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
