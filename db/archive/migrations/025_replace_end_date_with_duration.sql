-- Migration 025: projects have a start date + duration, not an end date.
--
-- We do not have official project end dates — only a start date and a duration.
-- This reverses migration 020: re-add `project_duration_months` (integer),
-- backfill it from the existing start/end dates, then drop `project_end_date`.
-- The workplan quarter range is now derived from start + duration.

SET search_path TO reporting_platform;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_duration_months INTEGER;

UPDATE projects
   SET project_duration_months =
       (EXTRACT(YEAR  FROM AGE(project_end_date, project_start_date)) * 12
      + EXTRACT(MONTH FROM AGE(project_end_date, project_start_date)))::int
 WHERE project_duration_months IS NULL
   AND project_start_date IS NOT NULL
   AND project_end_date   IS NOT NULL;

ALTER TABLE projects DROP COLUMN IF EXISTS project_end_date;
