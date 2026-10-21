-- Indirect support costs actually spent (project updates)
--
-- The Expenditure page used to derive the whole indirect support cost row from
-- the project costs sub total × the project's rate — approved AND actual alike.
-- On a project update the actual figure is now entered by the partner for the
-- year the document reports, and the row's total is the sum of those yearly
-- figures. The approved side is still derived from the rate.
--
-- One figure per document, so it lives on the report row: expenditure_entries is
-- keyed by budget category and indirect support costs are not a budget category.
-- NULL means "not entered", in which case the page falls back to the rate applied
-- to that year's actual project costs — exactly what it showed before.
--
-- Only project updates write it today. Annual reports are untouched.

ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS indirect_expenditure NUMERIC(15,2)
    CHECK (indirect_expenditure IS NULL OR indirect_expenditure >= 0);
