-- Migration 018: indicators (master library) + indicator_data (per-report lines)
-- Replaces the legacy indicators / indicator_sections tables (only truncated in db/005,
-- never dropped — so they still physically exist and must be dropped to reuse the name).

SET search_path TO reporting_platform;

DROP TABLE IF EXISTS reporting_platform.indicator_sections CASCADE;
DROP TABLE IF EXISTS reporting_platform.indicators CASCADE;

-- ── Indicators (master library) ──────────────────────────────────────────────
-- Standard indicators are global (project_id IS NULL); custom indicators are
-- created on the fly while editing a report and scoped to that project.
-- archived_at soft-deletes so historical reports never break.
CREATE TABLE indicators (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  means_of_verification TEXT,
  category              TEXT,
  cycle                 TEXT CHECK (cycle IN ('yearly', 'at_closure')),
  is_standard           BOOLEAN NOT NULL DEFAULT TRUE,
  project_id            INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ( (is_standard AND project_id IS NULL) OR (NOT is_standard AND project_id IS NOT NULL) )
);

CREATE INDEX indicators_project_idx ON indicators(project_id);

CREATE TRIGGER indicators_updated_at
  BEFORE UPDATE ON indicators
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Indicator data (one row per indicator per report) ────────────────────────
-- Admin scaffolds baseline/target; partner reports achieved_value/status/comment.
CREATE TABLE indicator_data (
  id             SERIAL PRIMARY KEY,
  report_id      INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  indicator_id   INTEGER NOT NULL REFERENCES indicators(id) ON DELETE RESTRICT,
  baseline_value TEXT,
  baseline_year  SMALLINT CHECK (baseline_year BETWEEN 2000 AND 2050),
  target_value   TEXT,
  target_year    SMALLINT CHECK (target_year BETWEEN 2000 AND 2050),
  achieved_value TEXT,
  status         TEXT CHECK (status IN ('on_track', 'off_track', 'ahead_of_schedule')),
  comment        TEXT,
  sort_order     SMALLINT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, indicator_id)
);

CREATE INDEX indicator_data_report_idx    ON indicator_data(report_id);
CREATE INDEX indicator_data_indicator_idx ON indicator_data(indicator_id);

CREATE TRIGGER indicator_data_updated_at
  BEFORE UPDATE ON indicator_data
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
