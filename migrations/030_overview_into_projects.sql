-- 030_overview_into_projects.sql
-- Collapse the redundant `overview` table into `projects` (+ partners/reports).
-- Every overview field already lived elsewhere except `project_lead`, so add
-- that to projects, migrate the authorization signal onto reports.authorized
-- (the column the whole app actually reads — the partner checkbox historically
-- wrote to overview.authorized, which nothing consumed), backfill
-- project_lead / implementing_partners from the most recent report's overview
-- row per project, then drop the table.

SET search_path TO reporting_platform, public;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_lead TEXT;

-- Preserve any authorizations partners had already granted.
UPDATE reports r
   SET authorized = o.authorized
  FROM overview o
 WHERE o.reportid = r.id
   AND o.authorized IS TRUE;

-- Backfill project_lead from the latest report's overview row for each project.
UPDATE projects p
   SET project_lead = sub.project_lead
  FROM (
    SELECT DISTINCT ON (r.project_id) r.project_id, o.project_lead
      FROM overview o
      JOIN reports r ON r.id = o.reportid
     WHERE o.project_lead IS NOT NULL
     ORDER BY r.project_id, r.year DESC
  ) sub
 WHERE p.id = sub.project_id
   AND p.project_lead IS NULL;

-- Backfill implementing_partners the same way (only where the project has none).
UPDATE projects p
   SET implementing_partners = sub.implementing_partners
  FROM (
    SELECT DISTINCT ON (r.project_id) r.project_id, o.implementing_partners
      FROM overview o
      JOIN reports r ON r.id = o.reportid
     WHERE o.implementing_partners IS NOT NULL
     ORDER BY r.project_id, r.year DESC
  ) sub
 WHERE p.id = sub.project_id
   AND p.implementing_partners IS NULL;

DROP TABLE IF EXISTS overview;
