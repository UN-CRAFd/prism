-- ─────────────────────────────────────────────────────────────────────────────
-- Expenditure reporting: standard budget categories + approved annual budgets
-- (admin/prodoc-owned) + actual annual expenditure per report (partner-owned).
--
-- All totals are computed, never stored:
--   • Approved total (per category) = Σ approved_amount over years
--   • Total expenditure (per category) = Σ annual_expenditure over the reports
--   • Difference = expenditure − approved
--   • Project costs sub total = Σ the direct categories
--   • Indirect support costs = indirect_cost_rate × sub total
--   • Total = sub total + indirect
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- Per-project indirect cost rate (default 7%) + the "Reported to MPTFO … [LINK]".
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS indirect_cost_rate NUMERIC(5,4) NOT NULL DEFAULT 0.07;

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS mptfo_report_link TEXT;

-- ── Category master list (standard MPTFO set, global — like `indicators`) ─────
CREATE TABLE IF NOT EXISTS expenditure_categories (
    id          SERIAL       PRIMARY KEY,
    name        TEXT         NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO expenditure_categories (name, sort_order) VALUES
    ('Staff and other personnel',            1),
    ('Supplies, commodities, materials',     2),
    ('Equipment, vehicles, & furniture',     3),
    ('Contractual services',                 4),
    ('Travel',                               5),
    ('Transfers & grants to counterparts',   6),
    ('General operating & other direct costs', 7)
ON CONFLICT DO NOTHING;

-- ── Approved annual budget (one row per project / category / year) ───────────
CREATE TABLE IF NOT EXISTS expenditure_budgets (
    id              SERIAL       PRIMARY KEY,
    project_id      INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id     INTEGER      NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    year            SMALLINT     NOT NULL,
    approved_amount NUMERIC(15,2),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, category_id, year)
);

CREATE INDEX IF NOT EXISTS expenditure_budgets_project_idx ON expenditure_budgets(project_id);

CREATE TRIGGER expenditure_budgets_updated_at
    BEFORE UPDATE ON expenditure_budgets
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Actual expenditure (one row per report / category) ───────────────────────
CREATE TABLE IF NOT EXISTS expenditure_entries (
    id                 SERIAL       PRIMARY KEY,
    report_id          INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category_id        INTEGER      NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    annual_expenditure NUMERIC(15,2),
    comment            TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, category_id)
);

CREATE INDEX IF NOT EXISTS expenditure_entries_report_idx ON expenditure_entries(report_id);

CREATE TRIGGER expenditure_entries_updated_at
    BEFORE UPDATE ON expenditure_entries
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
