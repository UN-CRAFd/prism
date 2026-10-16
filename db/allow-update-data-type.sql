-- Project Updates (V1), part 2
-- The live reports.data_type column is TEXT guarded by a CHECK constraint
-- (not data_type_enum, which db/schema.sql still shows). Widen the CHECK so
-- Project Update rows (data_type = 'update') can be inserted.

ALTER TABLE reporting_platform.reports
  DROP CONSTRAINT IF EXISTS reports_data_type_check;

ALTER TABLE reporting_platform.reports
  ADD CONSTRAINT reports_data_type_check
  CHECK (data_type = ANY (ARRAY['report'::text, 'prodoc'::text, 'update'::text]));
