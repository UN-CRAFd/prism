-- Migration 015: results table
CREATE TABLE IF NOT EXISTS reporting_platform.results (
  id                    SERIAL PRIMARY KEY,
  report_id             INTEGER NOT NULL
                          REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
  context               TEXT,
  data_driven_decision  TEXT,
  resulting_impact      TEXT,
  links                 TEXT,
  sort_order            SMALLINT NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS results_report_id_idx
  ON reporting_platform.results(report_id);
