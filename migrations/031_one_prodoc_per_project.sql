-- 031_one_prodoc_per_project.sql
-- Every project has exactly one project document — a `reports` row with
-- data_type='prodoc'. Projects now auto-create their prodoc on creation; here we
-- reconcile existing data: dedupe projects that have several prodocs (keep the
-- oldest), backfill projects with none, and enforce one-per-project going
-- forward with a partial unique index.

SET search_path TO reporting_platform, public;

-- 1. Dedupe — keep the oldest prodoc per project, drop the rest. Child rows
--    (indicator_data, etc.) of the dropped prodocs cascade away with them.
DELETE FROM reports r
 USING (
   SELECT id,
          ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id) AS rn
     FROM reports
    WHERE data_type = 'prodoc'
 ) dup
 WHERE r.id = dup.id AND dup.rn > 1;

-- 2. Backfill — one prodoc for every project that lacks one. Year defaults to
--    the project's start year, else the current year (clamped to the allowed range).
INSERT INTO reports (project_id, year, data_type)
SELECT p.id,
       LEAST(2050, GREATEST(2020,
         COALESCE(EXTRACT(YEAR FROM p.project_start_date)::int, EXTRACT(YEAR FROM NOW())::int)
       )),
       'prodoc'
  FROM projects p
 WHERE NOT EXISTS (
   SELECT 1 FROM reports r WHERE r.project_id = p.id AND r.data_type = 'prodoc'
 );

-- 3. Enforce exactly one prodoc per project from now on.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_prodoc_per_project
    ON reports (project_id) WHERE data_type = 'prodoc';
