-- Drop redundant long_name column from projects.
-- project_title already carries the full name; long_name was always a duplicate.
ALTER TABLE reporting_platform.projects DROP COLUMN IF EXISTS long_name;


