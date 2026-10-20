-- Backfill survey questions onto project updates that carry the Surveys page.
--
-- /api/reports seeds these when an update is created, but updates made before
-- that logic existed have the Surveys tab and nothing in it. This fills them in
-- with the same rule the creation path uses, and the same rule a second annual
-- report follows:
--
--   1. copy the project's most recent annual report of the matching type, so
--      edits to one year's survey carry forward;
--   2. failing that, use the admin-authored standard questions for that type.
--
-- Only touches updates that have the Surveys page AND no questions yet, so it is
-- safe to re-run and never disturbs answers already given.

-- 1) Copy from the project's latest matching report.
INSERT INTO reporting_platform.surveys (report_id, question, category)
SELECT u.id, s.question, s.category
  FROM reporting_platform.reports u
  JOIN LATERAL (
    SELECT pr.id
      FROM reporting_platform.reports pr
     WHERE pr.project_id = u.project_id
       AND pr.data_type = 'report'
       AND pr.report_type::text =
           CASE WHEN 'final_report' = ANY(u.update_types) THEN 'final' ELSE 'annual' END
       AND pr.year <= u.year
     ORDER BY pr.year DESC, pr.id DESC
     LIMIT 1
  ) prev ON TRUE
  JOIN reporting_platform.surveys s ON s.report_id = prev.id
 WHERE u.data_type = 'update'
   AND 'surveys' = ANY(u.unlocked_sections)
   AND NOT EXISTS (SELECT 1 FROM reporting_platform.surveys x WHERE x.report_id = u.id)
 ORDER BY u.id, s.id;

-- 2) Anything still empty falls back to the standard questions.
INSERT INTO reporting_platform.surveys (report_id, question, category)
SELECT u.id, sq.question, sq.category
  FROM reporting_platform.reports u
  JOIN reporting_platform.standard_survey_questions sq
    ON sq.report_type::text =
       CASE WHEN 'final_report' = ANY(u.update_types) THEN 'final' ELSE 'annual' END
 WHERE u.data_type = 'update'
   AND 'surveys' = ANY(u.unlocked_sections)
   AND NOT EXISTS (SELECT 1 FROM reporting_platform.surveys x WHERE x.report_id = u.id)
 ORDER BY u.id, sq.sort_order, sq.id;
