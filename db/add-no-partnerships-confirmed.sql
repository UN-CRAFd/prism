-- Partner explicitly confirms the report has no partnerships to report. Like
-- no_transfers_confirmed / no_complementary_confirmed: the Partnerships section
-- counts as complete when every row is filled in OR this flag is set (zero rows
-- without the flag is NOT complete). Cleared automatically when a row is added.
ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS no_partnerships_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
