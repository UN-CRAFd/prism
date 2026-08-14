-- Implementing partners with prodoc edit rights.
--
-- A project has one OWNER (projects.partner_id, the "project lead"). This
-- junction grants ADDITIONAL partners edit rights on the project's PRODOC only
-- (never its annual reports). It is distinct from the free-text
-- projects.implementing_partners column, which stays display-only.
--
-- Authorization (src/lib/authz.ts) widens the project-scoped ownership checks
-- guardProject / guardProjectRow to include partners listed here, so editors can
-- edit prodoc sections (narratives, SDG, workplan baseline, budgets, documents,
-- signatures) while report-scoped guards remain owner-only.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS project_editors (
    project_id  INTEGER      NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    partner_id  INTEGER      NOT NULL REFERENCES partners(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, partner_id)
);

CREATE INDEX IF NOT EXISTS project_editors_partner_idx ON project_editors(partner_id);
