-- Migration: tranche matrix table.
-- Adds project_tranche_cells: one cell per (project, organization, tranche_number),
-- replacing the flat project_tranches rows with a matrix keyed by project_organizations.
-- project_tranches is left untouched — this migration only adds the new table.
--
-- Run as prism_admin (or the schema owner) after applying db/schema.sql:
--   psql "<ADMIN connection string>" -f db/add-tranche-matrix.sql

SET search_path TO reporting_platform, public;

BEGIN;

CREATE TABLE IF NOT EXISTS reporting_platform.project_tranche_cells (
    id               SERIAL        PRIMARY KEY,
    project_id       INTEGER       NOT NULL
                         REFERENCES reporting_platform.projects(id) ON DELETE CASCADE,
    organization_id  INTEGER       NOT NULL
                         REFERENCES reporting_platform.project_organizations(id) ON DELETE CASCADE,
    tranche_number   INTEGER       NOT NULL CHECK (tranche_number >= 1),
    amount           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    date_description TEXT,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (project_id, organization_id, tranche_number)
);

CREATE INDEX IF NOT EXISTS project_tranche_cells_project_id_idx
    ON reporting_platform.project_tranche_cells(project_id);

DROP TRIGGER IF EXISTS project_tranche_cells_updated_at
    ON reporting_platform.project_tranche_cells;
CREATE TRIGGER project_tranche_cells_updated_at
    BEFORE UPDATE ON reporting_platform.project_tranche_cells
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Grant access to the app role. If roles.sql is re-run after this migration,
-- the GRANT ON ALL TABLES in step 4 of roles.sql covers this table too.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE reporting_platform.project_tranche_cells
    TO prism_app;
GRANT USAGE, SELECT
    ON SEQUENCE reporting_platform.project_tranche_cells_id_seq
    TO prism_app;

COMMIT;
