ALTER TABLE reporting_platform.reports
ADD COLUMN IF NOT EXISTS data_type TEXT NOT NULL DEFAULT 'report'
  CHECK (data_type IN ('report', 'prodoc'));
