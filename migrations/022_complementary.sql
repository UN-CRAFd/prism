-- Migration 022: complementary funding for the project
--
-- Sibling of migration 021 (transfers). Same master + per-report split, with two
-- differences: the contribution is typed "In Cash" / "In Kind", and a single
-- contribution can be linked to SEVERAL workplan activities (stored as a JSONB
-- array of activity ids, mirroring workplan_activities.planned_quarters).
--
--   • complementary_contributors — the contributing organisation (name, website,
--                                  funding type), project-scoped, created on the
--                                  fly while a partner edits a report.
--   • complementary_data         — one row per contributor per report, holding the
--                                  contribution amount that year and the linked
--                                  workplan activities. UNIQUE(report_id, contributor_id).

SET search_path TO reporting_platform;

-- ── Contributors (master, one set per project) ───────────────────────────────
CREATE TABLE IF NOT EXISTS complementary_contributors (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contributor_name TEXT,
  website          TEXT,
  funding_type     TEXT CHECK (funding_type IN ('In Cash', 'In Kind')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS complementary_contributors_project_idx ON complementary_contributors(project_id);

CREATE TRIGGER complementary_contributors_updated_at
  BEFORE UPDATE ON complementary_contributors
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Contribution data (one row per contributor per report) ───────────────────
CREATE TABLE IF NOT EXISTS complementary_data (
  id                  SERIAL PRIMARY KEY,
  report_id           INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  contributor_id      INTEGER NOT NULL REFERENCES complementary_contributors(id) ON DELETE CASCADE,
  contribution_amount NUMERIC(14, 2),
  linked_activity_ids JSONB NOT NULL DEFAULT '[]',
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, contributor_id)
);

CREATE INDEX IF NOT EXISTS complementary_data_report_idx      ON complementary_data(report_id);
CREATE INDEX IF NOT EXISTS complementary_data_contributor_idx ON complementary_data(contributor_id);

CREATE TRIGGER complementary_data_updated_at
  BEFORE UPDATE ON complementary_data
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
