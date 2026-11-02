-- HACT recommendations become PROJECT-scoped (run after add-hact-recommendations.sql)
--
-- A project has one running list of HACT recommendations. CRAF'd maintains it
-- on the admin HACT Recommendations page (/admin/hact-recommendations), and the
-- same rows appear on the HACT page of every project update of that project —
-- an edit in either place is an edit to the one list. The partner still writes
-- only `partner_comment` (their justification), and only from an update that
-- is Open (enforced in /api/hact-recommendations).
--
-- Rows created per update before this migration are moved onto their update's
-- project. `report_id` is kept (nullable) as a record of where a row was first
-- entered; nothing reads it any more.
--
-- "No." is now derived from the row's position (1, 2, 3, …) and no longer
-- stored or typed; the `number` column is left in place, unused.

ALTER TABLE reporting_platform.hact_recommendations
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES reporting_platform.projects(id) ON DELETE CASCADE;

UPDATE reporting_platform.hact_recommendations h
   SET project_id = r.project_id
  FROM reporting_platform.reports r
 WHERE r.id = h.report_id
   AND h.project_id IS NULL;

ALTER TABLE reporting_platform.hact_recommendations
    ALTER COLUMN project_id SET NOT NULL,
    ALTER COLUMN report_id  DROP NOT NULL;

-- Re-sequence so each project's merged list numbers cleanly from 1.
UPDATE reporting_platform.hact_recommendations h
   SET sort_order = s.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY sort_order, id) AS rn
      FROM reporting_platform.hact_recommendations
  ) s
 WHERE s.id = h.id;

CREATE INDEX IF NOT EXISTS hact_recommendations_project_idx
    ON reporting_platform.hact_recommendations (project_id);
