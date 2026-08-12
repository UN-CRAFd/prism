-- ─────────────────────────────────────────────────────────────────────────────
-- Add `updated_at` edit-tracking to the tables the admin "Last edited" feature
-- reads (/api/reports computes a content-aware last_edited from these).
--
-- WHY THIS EXISTS
-- db/schema.sql (the canonical fresh setup) already declares `updated_at` + a
-- BEFORE UPDATE trigger on every table, but this database drifted and never got
-- them. Without an updated_at column there is nothing to read a "last edited"
-- time from, so this migration folds that piece of the canonical schema back in.
--
-- HOW TO RUN
--   • Run as the schema OWNER / an admin account — NOT the app's `prism_app`
--     role, which is DML-only and cannot ALTER TABLE or CREATE TRIGGER.
--   • Idempotent and safe to re-run: ADD COLUMN IF NOT EXISTS skips tables that
--     already have the column; the triggers are dropped and recreated each run.
--   • After running, RESTART the app process — /api/reports caches which tables
--     carry updated_at at module load, so it must re-introspect to pick this up.
--
-- BASELINE / HISTORY
-- Existing rows get updated_at = NOW() (the column default) — historical edit
-- times are unrecoverable. Everything reads as "just edited" until the next real
-- edit, after which timestamps are accurate going forward.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform, public;

-- The shared trigger function (CREATE OR REPLACE → safe if it already exists).
CREATE OR REPLACE FUNCTION reporting_platform.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  -- reports/projects anchor the aggregate; the rest are the report-scoped and
  -- prodoc project-scoped section tables the last_edited expression aggregates.
  tables text[] := ARRAY[
    'reports', 'projects',
    'risk_management', 'indicator_data', 'key_achievements', 'partnerships',
    'results', 'lessons_learned', 'external_coverage', 'testimonials', 'surveys',
    'workplan_entries', 'expenditure_entries', 'transfer_data', 'complementary_data',
    'project_narratives', 'project_sdg_targets', 'prodoc_signatures',
    'workplan_activities', 'expenditure_budgets', 'indicators'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE reporting_platform.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON reporting_platform.%I', t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON reporting_platform.%I '
      'FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at()',
      t || '_updated_at', t
    );
  END LOOP;
END $$;
