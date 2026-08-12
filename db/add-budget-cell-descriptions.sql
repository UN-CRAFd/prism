-- ─────────────────────────────────────────────────────────────────────────────
-- Per-cell descriptions for the approved-budget grid.
--
-- Adds an optional note to each (project × category × year) approved-budget cell
-- in the prodoc Budgets section — e.g. "Travel 2026: field visits to 3 sites".
-- Admin-entered in the editor; shown read-only in the report editor and printed
-- into the project document.
--
-- Idempotent: safe to run more than once. Run once against each live database.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

ALTER TABLE expenditure_budgets ADD COLUMN IF NOT EXISTS description TEXT;
