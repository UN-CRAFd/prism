-- Migration 016: lessons_learned table
CREATE TABLE IF NOT EXISTS reporting_platform.lessons_learned (
  id                   SERIAL PRIMARY KEY,
  report_id            INTEGER NOT NULL
                         REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
  category             TEXT,
  lesson_learned       TEXT,
  adjustment_informed  TEXT,
  sort_order           SMALLINT NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lessons_learned_report_id_idx
  ON reporting_platform.lessons_learned(report_id);
