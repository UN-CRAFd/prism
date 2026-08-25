-- Idempotent. Replaces the two free-text columns on projects with a normalised
-- project_organizations table. No data migration: both source columns held only
-- test data and are simply dropped.

BEGIN;

CREATE TABLE IF NOT EXISTS reporting_platform.project_organizations (
    id         SERIAL       PRIMARY KEY,
    project_id INTEGER      NOT NULL
                  REFERENCES reporting_platform.projects(id) ON DELETE CASCADE,
    name       VARCHAR(300) NOT NULL,
    type       VARCHAR(30)  NOT NULL CHECK (type IN ('participating', 'implementing')),
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_organizations_project_id_idx
    ON reporting_platform.project_organizations(project_id);

DROP TRIGGER IF EXISTS project_organizations_updated_at
    ON reporting_platform.project_organizations;
CREATE TRIGGER project_organizations_updated_at
    BEFORE UPDATE ON reporting_platform.project_organizations
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

ALTER TABLE reporting_platform.projects
    DROP COLUMN IF EXISTS implementing_partners,
    DROP COLUMN IF EXISTS participating_organizations;

COMMIT;
