-- ─────────────────────────────────────────────────────────────────────────────
-- Workplan: project-level activity hierarchy + per-report progress entries
--
-- Mirrors the indicators / indicator_sections split:
--   • workplan_activities  — master structure + baseline ("Tranche Release")
--                            timeline, defined once per project (admin-owned)
--   • workplan_entries     — one row per activity per report holding the updated
--                            timeline, status and comment (partner-owned)
--
-- Quarter columns are stored as JSONB arrays of self-describing keys, e.g.
--   ["2024-Q3", "2024-Q4", "2025-Q1"]
-- The visible column range is configured per project (workplan_quarter_start/end).
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- ── Per-project workplan column range ────────────────────────────────────────
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS workplan_quarter_start TEXT,   -- e.g. "2024-Q3"
    ADD COLUMN IF NOT EXISTS workplan_quarter_end   TEXT;   -- e.g. "2026-Q3"

-- ── Activities (master structure, one set per project) ───────────────────────
CREATE TABLE IF NOT EXISTS workplan_activities (
    id                 SERIAL       PRIMARY KEY,
    project_id         INTEGER      NOT NULL
                         REFERENCES projects(id) ON DELETE CASCADE,
    intermediate       TEXT,                          -- intermediate outcome heading
    objective_num      TEXT,                          -- e.g. "1"
    objective_text     TEXT,                          -- e.g. "Maintain ACLED's core operations…"
    activity_num       TEXT,                          -- e.g. "1.1"
    activity_text      TEXT,                          -- e.g. "Weekly collection and publication…"
    implementing_agent TEXT,                          -- e.g. "ACLED"
    planned_quarters   JSONB        NOT NULL DEFAULT '[]',  -- baseline timeline
    sort_order         INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workplan_activities_project_idx
    ON workplan_activities(project_id);

CREATE TRIGGER workplan_activities_updated_at
    BEFORE UPDATE ON workplan_activities
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Entries (one row per activity per report) ────────────────────────────────
CREATE TABLE IF NOT EXISTS workplan_entries (
    id               SERIAL       PRIMARY KEY,
    report_id        INTEGER      NOT NULL
                       REFERENCES reports(id) ON DELETE CASCADE,
    activity_id      INTEGER      NOT NULL
                       REFERENCES workplan_activities(id) ON DELETE CASCADE,
    updated_quarters JSONB,                            -- null = same as baseline
    status           TEXT         CHECK (status IN (
                         'Behind Schedule', 'On Track', 'Achieved'
                     )),
    comment          TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, activity_id)
);

CREATE INDEX IF NOT EXISTS workplan_entries_report_idx   ON workplan_entries(report_id);
CREATE INDEX IF NOT EXISTS workplan_entries_activity_idx ON workplan_entries(activity_id);

CREATE TRIGGER workplan_entries_updated_at
    BEFORE UPDATE ON workplan_entries
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
