-- Risk history step 2: copy risks that were added in a report (not in the ProDoc)
-- into every LATER Open report of the same project that doesn't have them yet.
-- Name/description/categories carried; baseline and updated values left blank.
-- Idempotent (skips risks already present by origin_risk_id).

SET search_path TO reporting_platform;

BEGIN;

WITH ins AS (
  INSERT INTO risk_management
    (report_id, risk_name, risk_description, source_risk_id, origin_risk_id)
  SELECT later.id, rm.risk_name, rm.risk_description, rm.id, rm.origin_risk_id
    FROM risk_management rm
    JOIN reports r     ON r.id = rm.report_id AND r.data_type = 'report'
    JOIN reports later ON later.project_id = r.project_id AND later.data_type = 'report'
                      AND later.year > r.year AND later.status = 'Open'
   WHERE rm.source_risk_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM risk_management x
                      WHERE x.report_id = later.id AND x.origin_risk_id = rm.origin_risk_id)
  RETURNING id, source_risk_id
)
INSERT INTO risk_categories (risk_id, category)
SELECT ins.id, rc.category
  FROM ins JOIN risk_categories rc ON rc.risk_id = ins.source_risk_id
ON CONFLICT (risk_id, category) DO NOTHING;

COMMIT;
