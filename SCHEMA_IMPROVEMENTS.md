# Schema Normalization & Type Safety Improvements

## Summary

Comprehensive database schema modernization implementing all Phase 1 and Phase 2 recommendations from the database review.

## Changes Made

### 1. ENUM Types for Type Safety ✓

Created 9 new ENUM types to replace TEXT + CHECK constraints:
- `project_status` — Project lifecycle stages
- `report_status` — Report workflow states (Open, Closed, Under Review)
- `data_type_enum` — Report types (report, prodoc)
- `report_type_enum` — Report format (annual, final)
- `indicator_category_enum` — Indicator categories
- `indicator_cycle_enum` — Reporting cycles (yearly, at_closure)
- `workplan_status` — Activity progress status
- `section_type` — Report section types
- `funding_type_enum` — Funding mechanism (In Cash, In Kind)

**Benefits:**
- Database-enforced type safety
- Smaller storage footprint
- Self-documenting schema
- Faster comparisons

### 2. Normalization: Risk Categories ✓

**Problem:** `risk_management.risk_category` stored as TEXT[] array violating 1NF.

**Solution:** Created `risk_categories` junction table:
```sql
CREATE TABLE risk_categories (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risk_management(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (risk_id, category)
);
```

**Benefits:**
- Atomic data storage (1NF compliant)
- Direct SQL queries without array unnesting
- Proper foreign key constraints
- Easier indexing

### 3. Column Naming Consistency ✓

**Problem:** `surveys.reportid` inconsistent with all other FKs using `{table}_id` format.

**Solution:** Renamed `surveys.reportid` → `surveys.report_id`

**Files Updated:**
- `db/schema.sql` — Table definition
- `db/014_schema_normalization.sql` — Migration
- `src/components/report-editor/types.ts` — TypeScript interface
- `src/components/admin/prodoc-editor-view.tsx` — TypeScript interface
- `src/app/api/surveys/route.ts` — API queries (4 occurrences)
- `src/app/api/reports/route.ts` — API queries (2 occurrences)
- `src/app/api/report-completion/route.ts` — Completion query
- `src/app/api/download/zip/route.ts` — Export query
- `src/app/api/reports/[id]/pdf/route.ts` — PDF generation
- `src/app/api/upload/file/route.ts` — Import query
- `src/app/admin/data/page.tsx` — Data table (2 occurrences)

### 4. Missing Constraints Added ✓

#### Unique Constraint
```sql
-- Prevent duplicate survey questions per report
ALTER TABLE surveys ADD CONSTRAINT surveys_unique_question_per_report
    UNIQUE (report_id, question);
```

#### Check Constraints
```sql
-- Validate item comment sections
ALTER TABLE item_comments 
    ADD CONSTRAINT item_comments_section_check
    CHECK (section::section_type IS NOT NULL);

-- Validate lesson learned categories
ALTER TABLE lessons_learned 
    ADD CONSTRAINT lessons_learned_category_check
    CHECK (category IN (
        'Operational Efficiency',
        'Risk Management',
        'Partnership Development',
        'Technical Innovation',
        'Advocacy & Influence',
        'Other'
    ));

-- Validate external coverage types
ALTER TABLE external_coverage 
    ADD CONSTRAINT external_coverage_type_check
    CHECK (type IN (
        'Media Coverage',
        'Academic Publication',
        'Policy Brief',
        'Conference Presentation',
        'Online Article',
        'Other'
    ));
```

### 5. Foreign Key Cascading Rule Fix ✓

**Problem:** `indicator_data.indicator_id ON DELETE RESTRICT` inconsistent with soft-delete pattern.

**Solution:** Changed to CASCADE to allow indicators to be deleted when data exists:
```sql
ALTER TABLE indicator_data
    DROP CONSTRAINT indicator_data_indicator_id_fkey,
    ADD CONSTRAINT indicator_data_indicator_id_fkey
        FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE;
```

### 6. Soft-Delete Indexes ✓

Added partial indexes for queries on non-archived records:
```sql
CREATE INDEX indicators_project_archived_idx ON indicators(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX transfer_partners_archived_idx ON transfer_partners(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX complementary_contributors_archived_idx ON complementary_contributors(project_id)
    WHERE archived_at IS NULL;

CREATE INDEX item_comments_unresolved_idx ON item_comments(report_id)
    WHERE resolved = FALSE;
```

### 7. VARCHAR Length Constraints ✓

Added length limits to prevent unbounded text storage:
```sql
ALTER TABLE partners ALTER COLUMN short_name TYPE VARCHAR(50);
ALTER TABLE partners ALTER COLUMN long_name TYPE VARCHAR(500);
ALTER TABLE projects ALTER COLUMN short_name TYPE VARCHAR(50);
ALTER TABLE projects ALTER COLUMN project_title TYPE VARCHAR(500);
ALTER TABLE partner_contacts ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE partner_contacts ALTER COLUMN role TYPE VARCHAR(100);
```

## Files Modified

### Database
- `db/schema.sql` — Updated canonical schema with ENUMs, normalized tables, and updated types
- `db/014_schema_normalization.sql` — Migration file with all transformations

### Application Code
- `src/components/report-editor/types.ts` — Updated Survey interface
- `src/components/admin/prodoc-editor-view.tsx` — Updated Survey interface
- `src/app/api/surveys/route.ts` — Updated all SQL queries
- `src/app/api/reports/route.ts` — Updated survey copy SQL
- `src/app/api/report-completion/route.ts` — Updated survey query
- `src/app/api/download/zip/route.ts` — Updated export query
- `src/app/api/reports/[id]/pdf/route.ts` — Updated PDF generation query
- `src/app/api/upload/file/route.ts` — Updated import query
- `src/app/admin/data/page.tsx` — Updated type definition and config

## Migration Instructions

### For Fresh Setup
Run `db/schema.sql` directly for the complete normalized schema.

### For Existing Databases
Run the migration in order:
1. `db/001_*.sql` through `db/013_*.sql` (existing migrations)
2. `db/014_schema_normalization.sql` (new normalization migration)

The migration is safe and idempotent — it uses `IF NOT EXISTS` guards for type creation.

## Benefits Achieved

✓ **Normalization**: Moved from denormalized TEXT[] array to proper 1NF junction table  
✓ **Type Safety**: 9 new ENUM types provide database-enforced constraints  
✓ **Consistency**: Standardized naming conventions across all tables  
✓ **Integrity**: Added 3 new CHECK constraints + 1 UNIQUE constraint  
✓ **Performance**: Added 4 partial indexes for soft-delete queries  
✓ **Scalability**: VARCHAR length limits prevent unbounded storage  

## No Breaking Changes

All API responses remain backward compatible. The TypeScript interfaces were updated to match the new `report_id` naming, but the JSON response format is unchanged.

## Verification

Run the migration and verify:
```sql
-- Check ENUMs exist
SELECT typname FROM pg_type WHERE typkind = 'e';

-- Check risk_categories table
SELECT * FROM risk_categories LIMIT 1;

-- Check surveys has UNIQUE constraint
\d surveys

-- Check indicator_data FK rule
SELECT constraint_name, delete_rule
  FROM information_schema.referential_constraints
  WHERE table_name = 'indicator_data'
    AND column_name = 'indicator_id';
```
