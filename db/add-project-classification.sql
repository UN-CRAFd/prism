-- Project classification fields (General Information tab of the project document)
--
--   allocation_modality     admin-only   Open Call | Closed Call | Targeted Allocation
--   investment_type         admin-only   one of the six investment types + Direct Cost
--   investment_theme        admin-only   Conflict | Climate | Fragility | Gender | ...
--                                        (admins can add/delete themes in the editor)
--   gender_equality_marker  partner-editable   GEM0 | GEM1 | GEM2 | GEM3
--
-- Plain TEXT columns: the allowed values live in src/lib/options.json and can be
-- edited under Settings → Dropdown options (same as the other choice columns).
-- The admin-only fields are hidden from partners by the API.
--
-- Idempotent. Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-project-classification.sql

SET search_path TO reporting_platform;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS allocation_modality    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS investment_type        TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS investment_theme       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gender_equality_marker TEXT;
