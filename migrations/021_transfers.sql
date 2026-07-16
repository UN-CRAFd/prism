-- Migration 021: transfers to implementing partners
--
-- Mirrors the indicators split (master library + per-report data):
--   • transfer_partners — the receiving organisation (name, website, type),
--                         project-scoped and created on the fly while a partner
--                         edits a report. archived_at soft-deletes so historical
--                         reports never break.
--   • transfer_data     — one row per transfer partner per report, holding the
--                         amount transferred that year and the workplan activity
--                         it is linked to. UNIQUE(report_id, transfer_partner_id).
--
-- The partner view pivots transfer_data across every year of the project (same
-- pattern as indicator_data?matrix=1): all years are visible, only the current
-- report's cells are editable.

SET search_path TO reporting_platform;

-- ── Transfer partners (master, one set per project) ──────────────────────────
CREATE TABLE IF NOT EXISTS transfer_partners (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_name TEXT,
  website           TEXT,
  partner_type      TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transfer_partners_project_idx ON transfer_partners(project_id);

CREATE TRIGGER transfer_partners_updated_at
  BEFORE UPDATE ON transfer_partners
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Transfer data (one row per transfer partner per report) ──────────────────
CREATE TABLE IF NOT EXISTS transfer_data (
  id                  SERIAL PRIMARY KEY,
  report_id           INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  transfer_partner_id INTEGER NOT NULL REFERENCES transfer_partners(id) ON DELETE CASCADE,
  amount_transferred  NUMERIC(14, 2),
  linked_activity_id  INTEGER REFERENCES workplan_activities(id) ON DELETE SET NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, transfer_partner_id)
);

CREATE INDEX IF NOT EXISTS transfer_data_report_idx  ON transfer_data(report_id);
CREATE INDEX IF NOT EXISTS transfer_data_partner_idx ON transfer_data(transfer_partner_id);

CREATE TRIGGER transfer_data_updated_at
  BEFORE UPDATE ON transfer_data
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
