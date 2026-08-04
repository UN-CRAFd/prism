-- Migration 013: key_achievements table
CREATE TABLE IF NOT EXISTS reporting_platform.key_achievements (
  id           SERIAL PRIMARY KEY,
  report_id    INTEGER NOT NULL
                 REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
  achievement  TEXT,
  significance TEXT,
  links        TEXT,
  sort_order   SMALLINT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS key_achievements_report_id_idx
  ON reporting_platform.key_achievements(report_id);
