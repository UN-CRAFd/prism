-- Expenditure: planned budgets for the remaining years (budget revisions)
--
-- On a project update carrying a budget revision ("+ proposed new budget"), the
-- partner no longer types the new requested total per category. Instead they
-- enter the budget they plan to spend in each remaining project year — and in
-- the year(s) a no cost extension adds — and the new requested total is worked
-- out as: spent so far + planned. One row per update, category and year.
--
-- Rows with category_id NULL hold the planned INDIRECT SUPPORT COSTS for that
-- year (indirect support costs are not a budget category).
--
-- For an update that does not close the current year (it is not also the
-- annual report), the current year is planned too: a planned annual budget
-- instead of a "to date" spending figure.
--
-- The computed total is still written to expenditure_entries.proposed_amount, so
-- prints and exports that read it keep working unchanged.
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-expenditure-forecasts.sql

CREATE TABLE IF NOT EXISTS reporting_platform.expenditure_forecasts (
    id              SERIAL        PRIMARY KEY,
    report_id       INTEGER       NOT NULL REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
    -- NULL = indirect support costs
    category_id     INTEGER       REFERENCES reporting_platform.expenditure_categories(id) ON DELETE CASCADE,
    year            SMALLINT      NOT NULL CHECK (year BETWEEN 2020 AND 2060),
    planned_amount  NUMERIC(15,2) CHECK (planned_amount IS NULL OR planned_amount >= 0),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- One figure per update, category and year; one indirect-support-cost figure
-- per update and year.
CREATE UNIQUE INDEX IF NOT EXISTS expenditure_forecasts_category_uq
    ON reporting_platform.expenditure_forecasts (report_id, category_id, year)
    WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenditure_forecasts_isc_uq
    ON reporting_platform.expenditure_forecasts (report_id, year)
    WHERE category_id IS NULL;

DROP TRIGGER IF EXISTS expenditure_forecasts_updated_at ON reporting_platform.expenditure_forecasts;
CREATE TRIGGER expenditure_forecasts_updated_at
    BEFORE UPDATE ON reporting_platform.expenditure_forecasts
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Granted explicitly so the app role can use the table whoever ran the migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON reporting_platform.expenditure_forecasts TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE reporting_platform.expenditure_forecasts_id_seq TO prism_app;
