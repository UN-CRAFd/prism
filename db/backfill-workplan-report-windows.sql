-- Make sure every annual/final report has its own workplan window
-- (same year; 'FR' for final reports, 'AR' otherwise). Report creation already
-- does this; this catches any report created before that existed.
-- Idempotent: skips windows that already exist.

SET search_path TO reporting_platform;

INSERT INTO workplan_updates (project_id, year, type_code, sort_order)
SELECT r.project_id, r.year,
       CASE r.report_type::text WHEN 'final' THEN 'FR' ELSE 'AR' END,
       COALESCE((SELECT MAX(wu.sort_order) FROM workplan_updates wu WHERE wu.project_id = r.project_id), 0)
         + ROW_NUMBER() OVER (PARTITION BY r.project_id ORDER BY r.year, r.id)
  FROM reports r
 WHERE r.data_type = 'report'
   AND NOT EXISTS (
     SELECT 1 FROM workplan_updates wu
      WHERE wu.project_id = r.project_id
        AND wu.year = r.year
        AND wu.type_code = CASE r.report_type::text WHEN 'final' THEN 'FR' ELSE 'AR' END
   );
