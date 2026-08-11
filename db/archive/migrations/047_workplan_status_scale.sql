-- 047_workplan_status_scale.sql
-- Widen the workplan progress scale from three values (Behind Schedule / On Track
-- / Achieved) to five (Achieved / On Track / Delayed / At Risk / Suspended).
-- workplan_entries.status was the shared `workplan_status` ENUM, but that enum is
-- only actually used by this column (indicator_data.status has been TEXT+CHECK
-- since migration 018). Convert this column off the enum to TEXT + CHECK so the
-- label set lives in one place (src/lib/workplan.ts) and stays easy to evolve.
-- The old 'Behind Schedule' maps to its closest new value, 'Delayed'
-- ("Timeline not met."). The now-unused enum type is left in place.

SET search_path TO reporting_platform, public;

-- Drop off the enum type (no-op if already TEXT on a re-run).
ALTER TABLE reporting_platform.workplan_entries
  ALTER COLUMN status TYPE TEXT USING status::text;

-- Remap the retired value.
UPDATE reporting_platform.workplan_entries
   SET status = 'Delayed'
 WHERE status = 'Behind Schedule';

-- Constrain to the new scale (idempotent: dropped then re-added).
ALTER TABLE reporting_platform.workplan_entries
  DROP CONSTRAINT IF EXISTS workplan_entries_status_check;
ALTER TABLE reporting_platform.workplan_entries
  ADD CONSTRAINT workplan_entries_status_check
  CHECK (status IS NULL OR status IN ('Achieved', 'On Track', 'Delayed', 'At Risk', 'Suspended'));
