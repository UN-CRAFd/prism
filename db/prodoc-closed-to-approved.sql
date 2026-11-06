-- ProDoc workflow: "Closed" becomes "Approved" for project documents only.
-- Reports and project updates keep Open / Under Review / Closed — their rows are
-- not touched. Run once, after deploying the matching app change.
--
-- Status values are admin-editable (Settings → Dropdown options), so the reports
-- table carries no status CHECK in db/schema.sql. Older databases may still have
-- the constraint added by archived migration 024 (Open / Closed / Under Review),
-- which would reject 'Approved' — drop it if present.
BEGIN;

ALTER TABLE reporting_platform.reports
  DROP CONSTRAINT IF EXISTS reports_status_check;

UPDATE reporting_platform.reports
   SET status = 'Approved'
 WHERE data_type = 'prodoc'
   AND status = 'Closed';

COMMIT;
