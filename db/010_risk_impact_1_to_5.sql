-- Change impact range from 1-15 to 1-5
ALTER TABLE reporting_platform.risk_management
  DROP CONSTRAINT IF EXISTS risk_management_impact_check;

ALTER TABLE reporting_platform.risk_management
  ADD CONSTRAINT risk_management_impact_check
  CHECK (impact BETWEEN 1 AND 5);
