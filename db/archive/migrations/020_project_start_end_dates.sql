-- Migration 020: project start/end dates drive everything
--
-- • projects: replace the free-text `project_duration` with an explicit
--   `project_end_date`. Duration (months) is now computed in the UI from the
--   start/end dates where needed.
-- • overview: the per-report start/end/duration columns are removed — these
--   dates now live on the project and are edited via the overview form.
-- • the workplan quarter range is derived from the project dates, so the
--   stored workplan_quarter_start/end columns are no longer needed.

SET search_path TO reporting_platform;

-- ── Projects: add end date, backfill from start + duration, drop duration ─────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_end_date DATE;

UPDATE projects
   SET project_end_date =
       (project_start_date
        + (NULLIF(REGEXP_REPLACE(project_duration, '[^0-9]', '', 'g'), '')::int * INTERVAL '1 month'))::date
 WHERE project_end_date IS NULL
   AND project_start_date IS NOT NULL
   AND NULLIF(REGEXP_REPLACE(project_duration, '[^0-9]', '', 'g'), '') IS NOT NULL;

ALTER TABLE projects DROP COLUMN IF EXISTS project_duration;

-- ── Overview: start/end/duration now live on the project ─────────────────────
ALTER TABLE overview DROP COLUMN IF EXISTS starting_date;
ALTER TABLE overview DROP COLUMN IF EXISTS end_date;
ALTER TABLE overview DROP COLUMN IF EXISTS project_duration_months;

-- ── Workplan range is derived from the project dates, not stored ─────────────
ALTER TABLE projects DROP COLUMN IF EXISTS workplan_quarter_start;
ALTER TABLE projects DROP COLUMN IF EXISTS workplan_quarter_end;
