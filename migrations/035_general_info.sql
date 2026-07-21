-- 035_general_info.sql
-- General Information tab on the project document:
--  • projects.description  — free-text project description, editable in the tab
--  • projects.status       — lifecycle status (Idea → … → Project Closed)
--  • project_contacts      — join table linking projects to partner_contacts,
--                            with the nature of the relationship and an
--                            applicant flag. One row per (project, contact).

SET search_path TO reporting_platform, public;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Ongoing'
    CHECK (status IN ('Idea', 'Ongoing', 'Operationally Closed', 'Financially Closed', 'Project Closed'));

CREATE TABLE IF NOT EXISTS project_contacts (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contact_id   INTEGER      NOT NULL REFERENCES partner_contacts(id) ON DELETE CASCADE,
    relationship TEXT         CHECK (relationship IN ('Focal Point', 'Project Manager')),
    is_applicant BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, contact_id)
);
CREATE INDEX IF NOT EXISTS project_contacts_project_idx ON project_contacts(project_id);
CREATE INDEX IF NOT EXISTS project_contacts_contact_idx ON project_contacts(contact_id);
DROP TRIGGER IF EXISTS project_contacts_updated_at ON project_contacts;
CREATE TRIGGER project_contacts_updated_at
    BEFORE UPDATE ON project_contacts
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
