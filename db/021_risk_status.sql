-- Report Risk tab: for each risk carried over from earlier reports / the ProDoc, the
-- partner says what happened since the last report:
--   'unchanged' → the risk has not changed (previous likelihood/impact are copied)
--   'changed'   → it is more or less likely (likelihood + impact re-assessed)
--   'happened'  → it has happened (impact + what was done recorded)
-- NULL = not answered yet. Only used on carried-over risks (source_risk_id IS NOT NULL);
-- risks added in the report itself keep a NULL status.
ALTER TABLE reporting_platform.risk_management
  ADD COLUMN IF NOT EXISTS risk_status TEXT
    CHECK (risk_status IN ('unchanged', 'changed', 'happened'));
