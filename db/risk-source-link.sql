-- Link each report risk to the ProDoc risk it was copied from.
-- source_risk_id IS NULL on a report risk = added during reporting ("New").
-- Also copies categories onto report risks that were copied without them.
-- Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE risk_management
  ADD COLUMN IF NOT EXISTS source_risk_id INTEGER REFERENCES risk_management(id) ON DELETE SET NULL;

-- Backfill: match report risks to their project's ProDoc risks by name.
UPDATE risk_management rr
   SET source_risk_id = pr.id
  FROM reports r
  JOIN reports pd ON pd.project_id = r.project_id AND pd.data_type = 'prodoc'
  JOIN risk_management pr ON pr.report_id = pd.id
 WHERE rr.report_id = r.id
   AND r.data_type = 'report'
   AND rr.source_risk_id IS NULL
   AND lower(trim(pr.risk_name)) = lower(trim(rr.risk_name));

-- Copy categories from the ProDoc risk where the report risk has none.
INSERT INTO risk_categories (risk_id, category)
SELECT rr.id, rc.category
  FROM risk_management rr
  JOIN risk_categories rc ON rc.risk_id = rr.source_risk_id
 WHERE rr.source_risk_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM risk_categories x WHERE x.risk_id = rr.id)
ON CONFLICT (risk_id, category) DO NOTHING;

COMMIT;
