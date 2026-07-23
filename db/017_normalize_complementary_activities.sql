-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: Normalize complementary_data.linked_activity_ids → junction table
--
-- complementary_data linked its contributions to workplan activities via a JSONB
-- integer array (`linked_activity_ids`), outside the FK system. That contradicts
-- the project's own normalization standard (cf. migration 014's risk_categories
-- junction) and its sibling table transfer_data, which links a single activity via
-- a real FK. The array had no referential integrity: deleting a workplan_activity
-- left dangling ids that the read queries had to silently filter out.
--
-- Fix: introduce complementary_data_activities(complementary_data_id, activity_id)
-- with real FKs (ON DELETE CASCADE removes the link when either side goes away),
-- migrate the existing arrays into rows (dropping any orphaned ids), then drop the
-- JSONB column.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── Step 1: Junction table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complementary_data_activities (
    complementary_data_id INTEGER NOT NULL REFERENCES complementary_data(id)      ON DELETE CASCADE,
    activity_id           INTEGER NOT NULL REFERENCES workplan_activities(id)      ON DELETE CASCADE,
    PRIMARY KEY (complementary_data_id, activity_id)
);
CREATE INDEX IF NOT EXISTS complementary_data_activities_activity_idx
    ON complementary_data_activities(activity_id);

-- ── Step 2: Migrate existing JSONB arrays into junction rows ──────────────────
-- The JOIN to workplan_activities drops ids that no longer resolve (the same
-- orphans the old read query filtered out), so no dangling links are carried over.
INSERT INTO complementary_data_activities (complementary_data_id, activity_id)
SELECT d.id, act.id
  FROM complementary_data d
  CROSS JOIN LATERAL jsonb_array_elements_text(d.linked_activity_ids) AS elem(val)
  JOIN workplan_activities act ON act.id = elem.val::int
 ON CONFLICT DO NOTHING;

-- ── Step 3: Drop the denormalized JSONB column ────────────────────────────────
ALTER TABLE complementary_data DROP COLUMN IF EXISTS linked_activity_ids;
