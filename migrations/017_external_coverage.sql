-- Migration 017: external_coverage table
CREATE TABLE IF NOT EXISTS reporting_platform.external_coverage (
  id               SERIAL PRIMARY KEY,
  report_id        INTEGER NOT NULL
                     REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
  type             TEXT,
  description      TEXT,
  reach_indicator  TEXT,
  links            TEXT,
  sort_order       SMALLINT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS external_coverage_report_id_idx
  ON reporting_platform.external_coverage(report_id);
