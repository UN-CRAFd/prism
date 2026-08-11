-- 046_workplan_update_windows.sql
-- Decouple workplan progress from reports. Previously a project's workplan
-- progress was one workplan_entries row per (report_id, activity_id), pivoted per
-- reporting YEAR — so multiple in-year updates (a Tranche Release, a Budget
-- Revision, an Annual Report …) collapsed together. Now progress attaches to
-- admin-managed "update windows" (workplan_updates), each labelled [YEAR]+[code]
-- (TR/NCE/BR/AR/FR). One window per project is `active` (the only one partners may
-- edit); windows can be `hidden` from partners. workplan_entries keys on
-- (update_id, activity_id); report_id survives only as write provenance.

SET search_path TO reporting_platform, public;

-- ── 1) Update-window master (project-level, admin-owned) ─────────────────────
CREATE TABLE IF NOT EXISTS workplan_updates (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    year        INTEGER      NOT NULL,
    type_code   TEXT         NOT NULL CHECK (type_code IN ('TR','NCE','BR','AR','FR')),
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT FALSE,
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workplan_updates_project_idx ON workplan_updates(project_id);
-- At most one active window per project.
CREATE UNIQUE INDEX IF NOT EXISTS workplan_updates_one_active_uq
    ON workplan_updates(project_id) WHERE is_active;

DROP TRIGGER IF EXISTS workplan_updates_updated_at ON workplan_updates;
CREATE TRIGGER workplan_updates_updated_at
    BEFORE UPDATE ON workplan_updates
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── 2) workplan_entries gains update_id; report_id becomes nullable provenance.
-- Its FK flips CASCADE→SET NULL so deleting a report no longer wipes a window's
-- progress (the window owns the row now).
ALTER TABLE workplan_entries ADD COLUMN IF NOT EXISTS update_id INTEGER
    REFERENCES workplan_updates(id) ON DELETE CASCADE;
ALTER TABLE workplan_entries ALTER COLUMN report_id DROP NOT NULL;
ALTER TABLE workplan_entries DROP CONSTRAINT IF EXISTS workplan_entries_report_id_fkey;
ALTER TABLE workplan_entries
    ADD CONSTRAINT workplan_entries_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

-- ── 3) Backfill one window per distinct (project, year, report_type→code) that
-- actually has entries. report_type_enum is only 'annual'/'final', so the AR/FR
-- mapping is total. Guarded against re-runs by the NOT EXISTS anti-join.
INSERT INTO workplan_updates (project_id, year, type_code, sort_order)
SELECT d.project_id, d.year, d.type_code,
       ROW_NUMBER() OVER (PARTITION BY d.project_id ORDER BY d.year, d.type_code)
  FROM (
    SELECT DISTINCT r.project_id, r.year,
           CASE r.report_type WHEN 'final' THEN 'FR' ELSE 'AR' END AS type_code
      FROM reports r
      JOIN workplan_entries e ON e.report_id = r.id
     WHERE r.data_type = 'report'
  ) d
 WHERE NOT EXISTS (
    SELECT 1 FROM workplan_updates wu
     WHERE wu.project_id = d.project_id AND wu.year = d.year AND wu.type_code = d.type_code
 );

-- ── 4) Link existing entries to their backfilled window.
UPDATE workplan_entries e
   SET update_id = wu.id
  FROM reports r
  JOIN workplan_updates wu
    ON wu.project_id = r.project_id AND wu.year = r.year
   AND wu.type_code = CASE r.report_type WHEN 'final' THEN 'FR' ELSE 'AR' END
 WHERE e.report_id = r.id AND e.update_id IS NULL;

-- ── 5) Mark the most-recent window per project active (only if none is yet).
UPDATE workplan_updates SET is_active = TRUE
 WHERE id IN (
    SELECT DISTINCT ON (w.project_id) w.id
      FROM workplan_updates w
     WHERE NOT EXISTS (
        SELECT 1 FROM workplan_updates a
         WHERE a.project_id = w.project_id AND a.is_active
     )
     ORDER BY w.project_id, w.year DESC, w.id DESC
 );

-- ── 6) Swap the uniqueness constraint onto (update_id, activity_id).
ALTER TABLE workplan_entries
    DROP CONSTRAINT IF EXISTS workplan_entries_report_id_activity_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS workplan_entries_update_activity_uq
    ON workplan_entries(update_id, activity_id);
CREATE INDEX IF NOT EXISTS workplan_entries_update_idx ON workplan_entries(update_id);

-- Every entry came from a report and thus got a window; enforce NOT NULL only
-- when that holds (a stray NULL would abort — investigate rather than force).
ALTER TABLE workplan_entries ALTER COLUMN update_id SET NOT NULL;
