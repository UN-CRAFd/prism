-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Schema Normalization & Type Safety Improvements
--
-- Implements:
-- 1. ENUM types for type safety (project_status, report_status, etc.)
-- 2. Normalize risk_management.risk_category from TEXT[] to junction table
-- 3. Rename surveys.reportid to surveys.report_id (consistency)
-- 4. Add missing UNIQUE and CHECK constraints
-- 5. Fix indicator_data FK cascading rule
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── Step 1: Create ENUM types ────────────────────────────────────────────────

CREATE TYPE project_status AS ENUM (
    'Idea',
    'Ongoing',
    'Operationally Closed',
    'Financially Closed',
    'Project Closed'
);

CREATE TYPE report_status AS ENUM (
    'Open',
    'Closed',
    'Under Review'
);

CREATE TYPE data_type_enum AS ENUM (
    'report',
    'prodoc'
);

CREATE TYPE report_type_enum AS ENUM (
    'annual',
    'final'
);

CREATE TYPE indicator_category_enum AS ENUM (
    'Data Outputs & Quality',
    'Analytics Products',
    'Access & Usage',
    'Reach & Influence',
    'Capacity & Partnerships'
);

CREATE TYPE indicator_cycle_enum AS ENUM (
    'yearly',
    'at_closure'
);

CREATE TYPE workplan_status AS ENUM (
    'Behind Schedule',
    'On Track',
    'Achieved'
);

CREATE TYPE section_type AS ENUM (
    'general',
    'narratives',
    'risk',
    'indicators',
    'workplan',
    'expenditure',
    'surveys',
    'key_achievements',
    'partnerships',
    'results',
    'lessons_learned',
    'external_coverage',
    'testimonials'
);

CREATE TYPE funding_type_enum AS ENUM (
    'In Cash',
    'In Kind'
);

-- ── Step 2: Create risk_categories junction table ─────────────────────────────

CREATE TABLE IF NOT EXISTS risk_categories (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risk_management(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (risk_id, category)
);

CREATE INDEX IF NOT EXISTS risk_categories_risk_id_idx ON risk_categories(risk_id);

DROP TRIGGER IF EXISTS risk_categories_updated_at ON risk_categories;
CREATE TRIGGER risk_categories_updated_at
    BEFORE UPDATE ON risk_categories
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Migrate existing data from risk_management.risk_category (TEXT[]) to new table
INSERT INTO risk_categories (risk_id, category)
SELECT rm.id, cat
FROM risk_management rm, LATERAL unnest(rm.risk_category) AS cat
WHERE rm.risk_category IS NOT NULL AND array_length(rm.risk_category, 1) > 0
ON CONFLICT (risk_id, category) DO NOTHING;

-- Drop the old TEXT[] column from risk_management
ALTER TABLE risk_management DROP COLUMN IF EXISTS risk_category;

-- ── Step 3: Rename surveys.reportid to surveys.report_id ──────────────────────

ALTER TABLE surveys RENAME COLUMN reportid TO report_id;

-- Recreate the index with new column name
DROP INDEX IF EXISTS surveys_reportid_idx;
CREATE INDEX surveys_report_id_idx ON surveys(report_id);

-- ── Step 4: Update type columns to use ENUM types ──────────────────────────────

-- projects.status (drop default, convert type, re-add default)
ALTER TABLE projects ALTER COLUMN status DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN status TYPE project_status USING status::project_status;
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'Ongoing'::project_status;

-- reports.status (drop default, convert type, re-add default)
ALTER TABLE reports ALTER COLUMN status DROP DEFAULT;
ALTER TABLE reports ALTER COLUMN status TYPE report_status USING status::report_status;
ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'Open'::report_status;

-- reports.data_type (drop default, convert type, re-add default)
ALTER TABLE reports ALTER COLUMN data_type DROP DEFAULT;
ALTER TABLE reports ALTER COLUMN data_type TYPE data_type_enum USING data_type::data_type_enum;
ALTER TABLE reports ALTER COLUMN data_type SET DEFAULT 'report'::data_type_enum;

-- reports.report_type (nullable, so cast with NULLIF safety)
ALTER TABLE reports ALTER COLUMN report_type TYPE report_type_enum
    USING CASE WHEN report_type IS NULL THEN NULL ELSE report_type::report_type_enum END;

-- indicators.category
ALTER TABLE indicators ALTER COLUMN category TYPE indicator_category_enum
    USING CASE WHEN category IS NULL THEN NULL ELSE category::indicator_category_enum END;

-- indicators.cycle
ALTER TABLE indicators ALTER COLUMN cycle TYPE indicator_cycle_enum
    USING CASE WHEN cycle IS NULL THEN NULL ELSE cycle::indicator_cycle_enum END;

-- indicator_data.status
ALTER TABLE indicator_data ALTER COLUMN status TYPE workplan_status
    USING CASE WHEN status IS NULL THEN NULL ELSE status::workplan_status END;

-- workplan_entries.status
ALTER TABLE workplan_entries ALTER COLUMN status TYPE workplan_status
    USING CASE WHEN status IS NULL THEN NULL ELSE status::workplan_status END;

-- complementary_contributors.funding_type
ALTER TABLE complementary_contributors ALTER COLUMN funding_type TYPE funding_type_enum
    USING CASE WHEN funding_type IS NULL THEN NULL ELSE funding_type::funding_type_enum END;

-- ── Step 5: Add missing CHECK constraints ────────────────────────────────────

-- item_comments.section: validate against known section names
ALTER TABLE item_comments ADD CONSTRAINT item_comments_section_check
    CHECK (section::section_type IS NOT NULL);

-- lessons_learned.category: validate lesson learned categories
ALTER TABLE lessons_learned ADD CONSTRAINT lessons_learned_category_check
    CHECK (category IN (
        'Operational Efficiency',
        'Risk Management',
        'Partnership Development',
        'Technical Innovation',
        'Advocacy & Influence',
        'Other'
    ));

-- external_coverage.type: validate external coverage types
ALTER TABLE external_coverage ADD CONSTRAINT external_coverage_type_check
    CHECK (type IN (
        'Media Coverage',
        'Academic Publication',
        'Policy Brief',
        'Conference Presentation',
        'Online Article',
        'Other'
    ));

-- ── Step 6: Add missing UNIQUE constraints ──────────────────────────────────

-- surveys: prevent duplicate questions per report
ALTER TABLE surveys ADD CONSTRAINT surveys_unique_question_per_report
    UNIQUE (report_id, question);

-- ── Step 7: Fix indicator_data FK cascading rule ────────────────────────────────

-- Drop the old constraint and recreate with CASCADE
ALTER TABLE indicator_data
    DROP CONSTRAINT indicator_data_indicator_id_fkey,
    ADD CONSTRAINT indicator_data_indicator_id_fkey
        FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE;

-- ── Step 8: Add helpful indexes for soft-deleted records ──────────────────────

CREATE INDEX IF NOT EXISTS indicators_project_archived_idx ON indicators(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS transfer_partners_archived_idx ON transfer_partners(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS complementary_contributors_archived_idx ON complementary_contributors(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS item_comments_unresolved_idx ON item_comments(report_id)
    WHERE resolved = FALSE;

-- ── Step 9: Add VARCHAR length constraints to prevent unbounded strings ────────

ALTER TABLE partners ALTER COLUMN short_name TYPE VARCHAR(50);
ALTER TABLE partners ALTER COLUMN long_name TYPE VARCHAR(500);

ALTER TABLE projects ALTER COLUMN short_name TYPE VARCHAR(50);
ALTER TABLE projects ALTER COLUMN project_title TYPE VARCHAR(500);

ALTER TABLE partner_contacts ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE partner_contacts ALTER COLUMN role TYPE VARCHAR(100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete. Key changes:
--
-- 1. Created 9 ENUM types for type safety and self-documenting schema
-- 2. Migrated risk_category from TEXT[] array to risk_categories junction table
-- 3. Renamed surveys.reportid → surveys.report_id for consistency
-- 4. Added CHECK constraints to item_comments, lessons_learned, external_coverage
-- 5. Added UNIQUE constraint to surveys(report_id, question)
-- 6. Changed indicator_data FK to CASCADE (consistent with soft-delete pattern)
-- 7. Added partial indexes for soft-deleted and unresolved items
-- 8. Added VARCHAR length limits to prevent unbounded text columns
-- ─────────────────────────────────────────────────────────────────────────────
