-- Project Update modules (V2 of the "sections to unlock" picker)
-- 1) update_types lists the update categories the document covers — the ticked
--    COLUMNS of the module matrix (budget_revision, tranche_release, …).
-- 2) update_modules lists the modules it contains — the ticked ROWS
--    (justification, workplan_nce, expenditure_br, …).
-- Combining several types in one row is the point: a single update can be a
-- budget revision AND a tranche release, carrying the union of their modules.
--
-- unlocked_sections stays as-is and is DERIVED from update_modules on write, so
-- the report editor and sidebar keep resolving tabs exactly as before.
--
-- Which modules each type REQUIRES is not stored here — it is admin-authored and
-- lives in app_settings under `update_requirements` (no migration needed).

-- 3) update_months is the length of the extension for updates that include an
--    "+ extended time frame by XX months" row. One value for the whole update:
--    the Work Plan and Expenditure rows show the same number and are edited
--    together, so storing it per row could only let them drift apart.

ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS update_types   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS update_modules TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS update_months  INTEGER;
