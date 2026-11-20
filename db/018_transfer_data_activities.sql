-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018: transfer_data.linked_activity_id → junction table (multi-select)
--
-- A transfer to an implementing partner can now link to SEVERAL workplan
-- activities, like complementary funding (see 017). The links live in
-- transfer_data_activities(transfer_data_id, activity_id) with real FKs (ON DELETE
-- CASCADE removes the link when either side goes away); the existing single links
-- are copied across.
--
-- The old column transfer_data.linked_activity_id is deliberately NOT dropped here:
-- the live site still reads and writes it until the new code is deployed. Run
-- 019_drop_transfer_linked_activity_id.sql after the deploy.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS transfer_data_activities (
    transfer_data_id INTEGER NOT NULL REFERENCES transfer_data(id)        ON DELETE CASCADE,
    activity_id      INTEGER NOT NULL REFERENCES workplan_activities(id)  ON DELETE CASCADE,
    PRIMARY KEY (transfer_data_id, activity_id)
);
CREATE INDEX IF NOT EXISTS transfer_data_activities_activity_idx
    ON transfer_data_activities(activity_id);

-- Copy the existing single links (the JOIN drops any that no longer resolve).
INSERT INTO transfer_data_activities (transfer_data_id, activity_id)
SELECT d.id, act.id
  FROM transfer_data d
  JOIN workplan_activities act ON act.id = d.linked_activity_id
 ON CONFLICT DO NOTHING;

-- Safety check: every transfer whose linked_activity_id points at an existing
-- activity must now have exactly one junction row. A mismatch raises, which rolls
-- the whole migration back when it is run in a transaction.
DO $$
DECLARE
  expected INTEGER;
  actual   INTEGER;
BEGIN
  SELECT COUNT(*) INTO expected
    FROM transfer_data d
    JOIN workplan_activities act ON act.id = d.linked_activity_id;
  SELECT COUNT(*) INTO actual FROM transfer_data_activities;
  IF actual <> expected THEN
    RAISE EXCEPTION 'transfer_data_activities has % rows but % transfer_data rows link to an existing activity', actual, expected;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON transfer_data_activities TO prism_app;
