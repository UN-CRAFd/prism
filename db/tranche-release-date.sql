-- Tranche cells get a structured release date (one per organisation x tranche).
-- date_description is kept and now holds "Activities covered by this tranche";
-- existing text is left untouched. Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE project_tranche_cells ADD COLUMN IF NOT EXISTS release_date DATE;

COMMIT;
