-- 043_project_markers.sql
-- Three more free-text marker fields on the project, edited on the project
-- document's General Information tab alongside the keyword. Each holds a
-- comma-separated list of markers (like the keyword field); stored verbatim as
-- nullable TEXT, no parsing enforced at the DB level.
--
--   universal_markers      — markers that apply to every project
--   optional_markers       — optional/situational markers
--   fund_specific_markers  — markers specific to the fund

SET search_path TO reporting_platform, public;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS universal_markers TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS optional_markers TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fund_specific_markers TEXT;
