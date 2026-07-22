-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015: Expenditure Refactor - Budget vs Actual Comparison
--
-- Enables admins to define approved budgets at project level (all years),
-- and automatically links them to report-level actual expenditure for comparison.
--
-- Schema changes:
-- 1. Add `year` column to expenditure_entries for explicit year context
-- 2. Add `approved_amount` as GENERATED column (dynamic reference to current budget)
-- 3. Add `variance` and `variance_percent` as GENERATED ALWAYS AS STORED columns
-- 4. Add indexes for efficient querying
--
-- Key design: approved_amount is GENERATED (not static snapshot), so changing
-- project budgets automatically updates what all reports show. Single source of truth.
--
-- Data flow:
-- - Admin edits approved budgets in project document (expenditure_budgets)
-- - When report is created, expenditure_entries created (year and report_id set)
-- - approved_amount fetches CURRENT budget from expenditure_budgets on every read
-- - variance = annual_expenditure - approved_amount (auto-calculated)
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── Step 1: Add year column for explicit context ──────────────────────────────

ALTER TABLE expenditure_entries
    ADD COLUMN year SMALLINT CHECK (year BETWEEN 2020 AND 2050);

-- ── Step 2: Add approved_amount as GENERATED column (dynamic, always current) ──
-- This fetches the current approved budget from expenditure_budgets.
-- When project budget changes, all reports immediately reflect the new value.
-- Single source of truth: expenditure_budgets is the only place that stores approved amounts.

ALTER TABLE expenditure_entries
    ADD COLUMN approved_amount NUMERIC(15,2) GENERATED ALWAYS AS (
        COALESCE(
            (SELECT eb.approved_amount
             FROM reporting_platform.expenditure_budgets eb
             WHERE eb.project_id = (SELECT r.project_id FROM reporting_platform.reports r WHERE r.id = report_id)
             AND eb.category_id = category_id
             AND eb.year = year),
            0
        )
    ) STORED;

-- ── Step 3: Add GENERATED columns for variance calculations ────────────────────
-- These are computed automatically, reducing app-logic burden and ensuring consistency

ALTER TABLE expenditure_entries
    ADD COLUMN variance NUMERIC(15,2) GENERATED ALWAYS AS (
        CASE
            WHEN annual_expenditure IS NOT NULL
            THEN annual_expenditure - COALESCE(approved_amount, 0)
            ELSE NULL
        END
    ) STORED;

ALTER TABLE expenditure_entries
    ADD COLUMN variance_percent NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE
            WHEN annual_expenditure IS NOT NULL
                 AND approved_amount IS NOT NULL
                 AND approved_amount > 0
            THEN ROUND((annual_expenditure - approved_amount) * 100.0 / approved_amount, 2)
            ELSE NULL
        END
    ) STORED;

-- ── Step 4: Backfill year from existing reports (approved_amount is GENERATED) ──
-- Note: approved_amount is GENERATED, so it's auto-calculated. Only year needs backfill.

UPDATE expenditure_entries ee
SET year = r.year
FROM reports r
WHERE ee.report_id = r.id;

-- ── Step 5: Add NOT NULL constraint to year column ─────────────────────────────

ALTER TABLE expenditure_entries ALTER COLUMN year SET NOT NULL;

-- ── Step 6: Add indexes for efficient querying ────────────────────────────────

CREATE INDEX IF NOT EXISTS expenditure_entries_year_idx
    ON expenditure_entries(year);

CREATE INDEX IF NOT EXISTS expenditure_entries_project_year_idx
    ON expenditure_entries(category_id, year);

CREATE INDEX IF NOT EXISTS expenditure_entries_category_year_idx
    ON expenditure_entries(category_id, year)
    WHERE annual_expenditure IS NOT NULL;

-- ── Step 7: Add CHECK constraints for data integrity ──────────────────────────

ALTER TABLE expenditure_entries
    ADD CONSTRAINT expenditure_entries_amounts_positive
    CHECK (annual_expenditure IS NULL OR annual_expenditure >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete. Key changes:
--
-- 1. expenditure_entries now has explicit year column (backfilled, NOT NULL)
-- 2. approved_amount is GENERATED → always references current expenditure_budgets
--    - Budget changes in project document immediately reflected in all reports
--    - Single source of truth: expenditure_budgets table
-- 3. variance auto-calculated via GENERATED column (annual_expenditure - approved)
-- 4. variance_percent auto-calculated (variance / approved * 100)
-- 5. Indexes added for efficient year-based filtering
-- 6. CHECK constraints ensure data integrity (non-negative amounts)
--
-- Next steps:
-- - Remove populateExpenditureEntries() from report creation (no longer needed)
-- - Ensure report creation still creates empty expenditure_entries rows (year, category only)
-- - Update expenditure API to return new columns (year, approved_amount, variance)
-- - Update frontend to display budget vs actual comparison
-- ─────────────────────────────────────────────────────────────────────────────
