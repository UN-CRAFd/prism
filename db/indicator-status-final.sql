-- Indicator status: add the final-report values "achieved" / "not_achieved".
--
-- Annual reports (and project updates) report progress: on_track, off_track,
-- ahead_of_schedule. A final report only asks whether the target was met, so it
-- offers achieved / not_achieved instead. The app picks the list per report type
-- (src/lib/indicators.ts → statusKeysFor).
--
-- Migration 018 created indicator_data.status with an inline CHECK limited to the
-- three progress values, and make-dropdowns-editable.sql did not drop it. This
-- replaces that CHECK with one that also allows the two final-report values.
-- Existing rows are untouched.
--
-- Idempotent: safe to run more than once.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE indicator_data DROP CONSTRAINT IF EXISTS indicator_data_status_check;
ALTER TABLE indicator_data
  ADD CONSTRAINT indicator_data_status_check
  CHECK (status IN ('on_track', 'off_track', 'ahead_of_schedule', 'achieved', 'not_achieved'));

COMMIT;
