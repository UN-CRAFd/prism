-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: Drop the redundant expenditure_entries.year column
--
-- `expenditure_entries.year` (added in 015) is fully determined by the entry's
-- report: report_id → reports.year. It was denormalized onto the row only so the
-- GENERATED `approved_amount` expression could match the budget on the same-row
-- `year`. That copy can silently disagree with reports.year if a report's year is
-- ever changed, because every app-side read joins the budget on reports.year.
--
-- Fix: fold the year lookup into the generated expression (derive it from reports,
-- exactly like project_id already is), then drop the redundant column. No app code
-- reads expenditure_entries.year or its generated columns — the matrix, the admin
-- "Full Data" view and the ZIP export all recompute from expenditure_budgets.
--
-- approved_amount is referenced by variance/variance_percent, so all three
-- generated columns are dropped and recreated together.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── Step 1: Drop the generated columns (variance depends on approved_amount) ───
ALTER TABLE expenditure_entries DROP COLUMN IF EXISTS variance_percent;
ALTER TABLE expenditure_entries DROP COLUMN IF EXISTS variance;
ALTER TABLE expenditure_entries DROP COLUMN IF EXISTS approved_amount;

-- ── Step 2: Drop the redundant year column and its indexes ─────────────────────
DROP INDEX IF EXISTS expenditure_entries_year_idx;
DROP INDEX IF EXISTS expenditure_entries_project_year_idx;
DROP INDEX IF EXISTS expenditure_entries_category_year_idx;
ALTER TABLE expenditure_entries DROP COLUMN IF EXISTS year;

-- ── Step 3: Recreate approved_amount, deriving project_id AND year from reports ─
ALTER TABLE expenditure_entries
    ADD COLUMN approved_amount NUMERIC(15,2) GENERATED ALWAYS AS (
        COALESCE(
            (SELECT eb.approved_amount
               FROM reporting_platform.expenditure_budgets eb
              WHERE eb.project_id = (SELECT r.project_id FROM reporting_platform.reports r WHERE r.id = report_id)
                AND eb.category_id = category_id
                AND eb.year       = (SELECT r.year       FROM reporting_platform.reports r WHERE r.id = report_id)),
            0
        )
    ) STORED;

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

-- ── Step 4: Recreate the (now year-independent) category index ─────────────────
CREATE INDEX IF NOT EXISTS expenditure_entries_category_idx
    ON expenditure_entries(category_id)
    WHERE annual_expenditure IS NOT NULL;
