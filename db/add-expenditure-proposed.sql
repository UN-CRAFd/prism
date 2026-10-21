-- Proposed new budget (project updates that carry a budget revision)
--
-- The Expenditure page has four versions, selected by the modules ticked in the
-- update matrix: the plain actual-spending table, "+ proposed new budget",
-- "+ extended time frame", and both together. The proposed new budget version
-- adds two columns to the Total block — "Proposed new budget", which the partner
-- fills in, and "Difference in new budget", which is computed.
--
-- The figure is per (report, category) and covers the WHOLE project period, not
-- one year: a budget revision reallocates the grant between categories. It
-- therefore sits on expenditure_entries, which is already keyed that way, rather
-- than in expenditure_budgets (admin-owned, per year).
--
-- The grant size itself cannot change — the proposed amounts must still add up
-- to the approved project costs sub total. That rule is enforced in the editor,
-- which shows the partner the gap, rather than as a constraint here: a partially
-- filled table is a normal intermediate state and must be allowed to save.

ALTER TABLE reporting_platform.expenditure_entries
  ADD COLUMN IF NOT EXISTS proposed_amount NUMERIC(15,2)
    CHECK (proposed_amount IS NULL OR proposed_amount >= 0);
