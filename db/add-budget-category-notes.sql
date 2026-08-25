-- Migration: per-category budget description.
-- Adds expenditure_budget_category_notes: one description per (project, category),
-- replacing the per-year description cells that lived on expenditure_budgets.
-- The old description column on expenditure_budgets is kept but is no longer
-- written by the app.
--
-- Run as prism_admin (or the schema owner) after applying db/schema.sql:
--   psql "<ADMIN connection string>" -f db/add-budget-category-notes.sql

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS reporting_platform.expenditure_budget_category_notes (
    project_id   INTEGER NOT NULL REFERENCES reporting_platform.projects(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES reporting_platform.expenditure_categories(id) ON DELETE CASCADE,
    description  TEXT,
    PRIMARY KEY (project_id, category_id)
);

-- Grant access to the app role. If roles.sql is re-run after this migration,
-- the GRANT ON ALL TABLES in step 4 of roles.sql covers this table too.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE reporting_platform.expenditure_budget_category_notes
    TO prism_app;

GRANT USAGE ON SCHEMA reporting_platform TO prism_app;

