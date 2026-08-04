ALTER TABLE reporting_platform.reports
  ADD COLUMN status TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Closed', 'Pending'));
