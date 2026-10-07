-- Risk history across report years, step 1 (no data copied).
-- origin_risk_id: the risk's first appearance (ProDoc risk, or the report risk
-- where it was first added), used to match the same risk across years.
-- risk_shared_years: past years an admin has made visible to the partner on this report.
-- Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE risk_management ADD COLUMN IF NOT EXISTS origin_risk_id INTEGER;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS risk_shared_years INTEGER[] NOT NULL DEFAULT '{}';

UPDATE risk_management SET origin_risk_id = COALESCE(source_risk_id, id)
 WHERE origin_risk_id IS NULL;

CREATE INDEX IF NOT EXISTS risk_management_origin_idx ON risk_management(origin_risk_id);

CREATE OR REPLACE FUNCTION risk_set_origin() RETURNS trigger AS $$
BEGIN
  IF NEW.origin_risk_id IS NULL THEN
    IF NEW.source_risk_id IS NOT NULL THEN
      SELECT origin_risk_id INTO NEW.origin_risk_id
        FROM risk_management WHERE id = NEW.source_risk_id;
    END IF;
    NEW.origin_risk_id := COALESCE(NEW.origin_risk_id, NEW.source_risk_id, NEW.id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_management_set_origin ON risk_management;
CREATE TRIGGER risk_management_set_origin
  BEFORE INSERT ON risk_management
  FOR EACH ROW EXECUTE FUNCTION risk_set_origin();

COMMIT;
