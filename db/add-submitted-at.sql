-- Adds submitted_at to reports: the timestamp when a report was formally
-- submitted by the partner. Kept separate from report_submission_date (a
-- manually entered calendar date used for compliance tracking) so that the
-- system-recorded submission moment is never overwritten by admin edits.
--
-- roles.sql grants SELECT/INSERT/UPDATE/DELETE ON ALL TABLES in the schema,
-- so no additional GRANT is needed here.

ALTER TABLE reporting_platform.reports
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
