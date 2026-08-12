-- ─────────────────────────────────────────────────────────────────────────────
-- Make dropdown option lists admin-editable.
--
-- The choice columns below were ENUM types or inline CHECK constraints, which
-- would reject any option an admin adds via Settings → Dropdown options. This
-- migration converts them to plain TEXT and drops the whitelisting CHECKs, so the
-- application layer (lib/options.ts + the admin editor) becomes the single source
-- of truth for the allowed values. Existing rows keep their current values.
--
-- Idempotent: safe to run more than once. Run once against each live database.
--
-- NOTE: two of the dropped CHECKs (external_coverage.type, lessons_learned.category)
-- were already STALE — they listed values the app stopped using, so they would
-- reject even current writes. Dropping them also fixes that latent bug.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── ENUM columns → TEXT ──────────────────────────────────────────────────────
-- Pattern: drop default (if any), recast the column to text, restore the default.

ALTER TABLE projects              ALTER COLUMN status      DROP DEFAULT;
ALTER TABLE projects              ALTER COLUMN status      TYPE text USING status::text;
ALTER TABLE projects              ALTER COLUMN status      SET DEFAULT 'Ongoing';

ALTER TABLE reports               ALTER COLUMN status      DROP DEFAULT;
ALTER TABLE reports               ALTER COLUMN status      TYPE text USING status::text;
ALTER TABLE reports               ALTER COLUMN status      SET DEFAULT 'Open';

ALTER TABLE reports               ALTER COLUMN report_type TYPE text USING report_type::text;

ALTER TABLE standard_survey_questions ALTER COLUMN report_type TYPE text USING report_type::text;

ALTER TABLE indicators            ALTER COLUMN category    TYPE text USING category::text;
ALTER TABLE indicators            ALTER COLUMN cycle       TYPE text USING cycle::text;

ALTER TABLE indicator_data        ALTER COLUMN status      TYPE text USING status::text;

ALTER TABLE complementary_contributors ALTER COLUMN funding_type TYPE text USING funding_type::text;

-- ── Inline CHECK constraints → dropped ───────────────────────────────────────
-- Postgres auto-names a single-column inline CHECK "<table>_<column>_check".

ALTER TABLE project_contacts   DROP CONSTRAINT IF EXISTS project_contacts_relationship_check;
ALTER TABLE lessons_learned    DROP CONSTRAINT IF EXISTS lessons_learned_category_check;
ALTER TABLE external_coverage  DROP CONSTRAINT IF EXISTS external_coverage_type_check;
ALTER TABLE workplan_updates   DROP CONSTRAINT IF EXISTS workplan_updates_type_code_check;
ALTER TABLE workplan_entries   DROP CONSTRAINT IF EXISTS workplan_entries_status_check;
ALTER TABLE project_sdg_targets DROP CONSTRAINT IF EXISTS project_sdg_targets_priority_check;

-- ── Drop the now-unused ENUM types ───────────────────────────────────────────
-- (data_type_enum is intentionally kept — 'report'/'prodoc' is not user-editable.)

DROP TYPE IF EXISTS project_status;
DROP TYPE IF EXISTS report_status;
DROP TYPE IF EXISTS report_type_enum;
DROP TYPE IF EXISTS indicator_category_enum;
DROP TYPE IF EXISTS indicator_cycle_enum;
DROP TYPE IF EXISTS workplan_status;
DROP TYPE IF EXISTS funding_type_enum;
