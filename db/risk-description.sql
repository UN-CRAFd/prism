-- Risks get a short description, shown under the risk name.
-- Copied into reports with the rest of the ProDoc risk. Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE risk_management ADD COLUMN IF NOT EXISTS risk_description TEXT;

COMMIT;
