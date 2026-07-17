-- Rename report status value 'Pending' → 'Under Review'.
ALTER TABLE reporting_platform.reports
  DROP CONSTRAINT IF EXISTS reports_status_check;

UPDATE reporting_platform.reports
  SET status = 'Under Review'
  WHERE status = 'Pending';

ALTER TABLE reporting_platform.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status IN ('Open', 'Closed', 'Under Review'));
