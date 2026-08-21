-- Idempotent migration: add participating_organizations to projects.
-- Mirrors implementing_partners (plain TEXT, project-scoped, no FK).
ALTER TABLE reporting_platform.projects
    ADD COLUMN IF NOT EXISTS participating_organizations TEXT;
