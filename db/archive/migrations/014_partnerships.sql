-- Migration 014: partnerships table
CREATE TABLE IF NOT EXISTS reporting_platform.partnerships (
  id                   SERIAL PRIMARY KEY,
  report_id            INTEGER NOT NULL
                         REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
  partner_organization TEXT,
  result               TEXT,
  links                TEXT,
  sort_order           SMALLINT NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partnerships_report_id_idx
  ON reporting_platform.partnerships(report_id);
