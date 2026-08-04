-- 042_project_keyword_and_tranches.sql
-- Two additions to the project's core reference data, both edited on the
-- project document's General Information tab:
--
--  1. projects.keyword — a short free-text keyword/label for the project
--     (e.g. a thematic tag). A single nullable column on the project itself,
--     alongside the other general-info fields.
--
--  2. project_tranches — subdivides the grant (projects.grant_size_usd) into
--     one or more disbursement tranches, each with an amount, a date and an
--     optional comment. Project-level (keyed by project_id) and shared by both
--     the admin and partner sides, mirroring project_sdg_targets. The tranche
--     amounts are intended to sum to the grant size (a soft rule enforced in
--     the UI, not the DB, so partially-edited states remain storable).

SET search_path TO reporting_platform, public;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS keyword TEXT;

CREATE TABLE IF NOT EXISTS project_tranches (
    id            SERIAL        PRIMARY KEY,
    project_id    INTEGER       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    amount        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    tranche_date  DATE,
    comment       TEXT,
    sort_order    INTEGER       NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_tranches_project_idx ON project_tranches(project_id);
DROP TRIGGER IF EXISTS project_tranches_updated_at ON project_tranches;
CREATE TRIGGER project_tranches_updated_at
    BEFORE UPDATE ON project_tranches
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
