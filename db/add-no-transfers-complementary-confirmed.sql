-- Partner explicitly confirms the report has no transfers to implementing partners
-- and/or no complementary funding to report. Each of those two sections counts as
-- complete when every row is filled in OR its flag is set (zero rows without the flag
-- is NOT complete). Cleared automatically when a row is added to the section.
ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS no_transfers_confirmed     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS no_complementary_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
