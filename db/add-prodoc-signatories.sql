-- Standalone signatories for the Signatures tab: people who sign the project
-- document without being project contacts (e.g. an OIC standing in).
-- Deliberately NOT written back to partner_contacts.
CREATE TABLE IF NOT EXISTS reporting_platform.prodoc_signatories (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES reporting_platform.projects(id) ON DELETE CASCADE,
    title        TEXT,
    signee_name  TEXT         NOT NULL,
    organization TEXT,
    email        TEXT,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prodoc_signatories_project_idx
    ON reporting_platform.prodoc_signatories(project_id);
DROP TRIGGER IF EXISTS prodoc_signatories_updated_at ON reporting_platform.prodoc_signatories;
CREATE TRIGGER prodoc_signatories_updated_at
    BEFORE UPDATE ON reporting_platform.prodoc_signatories
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();