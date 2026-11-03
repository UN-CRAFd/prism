-- Archived / Active flag for projects
--
-- Archiving is done on the admin Projects page, per project. It cascades to every
-- document of the project (project document, reports, project updates), which
-- carry their own copy of the flag so the Reports and Project Updates overviews
-- can filter on it. A project can only be archived once all its reports and
-- project updates are Closed (enforced in POST /api/projects/[id]/archive), and
-- each change is written to the version log with a name and reason.
--
-- Archived rows stay fully intact — nothing is deleted or locked — they are only
-- hidden from the admin overview lists by default (Show: Active); Show: Archived
-- or All brings them back.
--
-- Optional for the app code: GET /api/reports introspects for the column and
-- reports every row as active until this has run. Archiving needs the columns.
-- The check is cached at module load, so restart the app afterwards.
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-archived.sql
--
-- roles.sql grants SELECT/INSERT/UPDATE/DELETE ON ALL TABLES in the schema,
-- so no additional GRANT is needed here.

ALTER TABLE reporting_platform.projects
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE reporting_platform.reports
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
