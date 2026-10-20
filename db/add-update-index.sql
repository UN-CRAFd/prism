-- Project Updates: more than one per year
--
-- A project can need a second (or third) update in the same year. They are told
-- apart by `update_index` — free text shown in brackets after the year, so the
-- second 2027 update reads "Project Update 2027 (2)". The first update of a year
-- keeps the empty index and reads "Project Update 2027" exactly as before.
--
-- That means relaxing UNIQUE (project_id, year, data_type), which allowed only
-- one row per project/year/type. The replacement simply adds update_index to the
-- key. Reports and prodocs never set it, so their '' value keeps them at one per
-- project/year/type — their behaviour is unchanged.
--
-- NOTE: this one is not optional for the app code the way add-update-modules.sql
-- is. /api/reports and /api/projects introspect for the column and fall back to
-- the old 3-column ON CONFLICT target when it is missing, so the app keeps
-- working before this runs — but a second update per year is rejected by the
-- database until it does.

ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS update_index TEXT NOT NULL DEFAULT '';

-- Drop whichever unique constraint covers exactly (project_id, year, data_type),
-- whatever it ended up named on this database.
DO $$
DECLARE target_name TEXT;
BEGIN
  SELECT con.conname INTO target_name
    FROM pg_constraint con
    JOIN pg_class     rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
   WHERE ns.nspname  = 'reporting_platform'
     AND rel.relname = 'reports'
     AND con.contype = 'u'
     -- attname is `name`, and there is no name[] = text[] operator, so cast the
     -- aggregate to text[] before comparing.
     AND (
       SELECT array_agg(att.attname::text ORDER BY att.attname::text)
         FROM unnest(con.conkey) AS k
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
     ) = ARRAY['data_type', 'project_id', 'year']
   LIMIT 1;

  IF target_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reporting_platform.reports DROP CONSTRAINT %I', target_name);
  END IF;
END $$;

-- Idempotent: skip if a previous run already added it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_class     rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
     WHERE ns.nspname  = 'reporting_platform'
       AND rel.relname = 'reports'
       AND con.conname = 'reports_project_id_year_data_type_update_index_key'
  ) THEN
    ALTER TABLE reporting_platform.reports
      ADD CONSTRAINT reports_project_id_year_data_type_update_index_key
      UNIQUE (project_id, year, data_type, update_index);
  END IF;
END $$;
