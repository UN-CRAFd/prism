-- Project Update justifications
--
-- The Justification page asks the partner to say WHY they are applying for each
-- update type the document covers — one open field per type, so a combined
-- "Annual Report + No Cost Extension" update is justified once for the NCE
-- rather than in a single undifferentiated box.
--
-- Keyed by (report_id, update_type): update_type holds a matrix column key
-- ('nce', 'budget_revision', …), or the sentinel 'general' for an update that
-- has no stored types (one created before db/add-update-index.sql ran).

CREATE TABLE IF NOT EXISTS reporting_platform.update_justifications (
    id            SERIAL       PRIMARY KEY,
    report_id     INTEGER      NOT NULL REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
    update_type   TEXT         NOT NULL,
    justification TEXT         NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, update_type)
);

CREATE INDEX IF NOT EXISTS update_justifications_report_idx
    ON reporting_platform.update_justifications (report_id);

DROP TRIGGER IF EXISTS update_justifications_updated_at ON reporting_platform.update_justifications;
CREATE TRIGGER update_justifications_updated_at
    BEFORE UPDATE ON reporting_platform.update_justifications
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- The schema's ALTER DEFAULT PRIVILEGES should cover this, but only for tables
-- created by the role those defaults are attached to. Granted explicitly so the
-- app role can use the table whoever ran the migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON reporting_platform.update_justifications TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE reporting_platform.update_justifications_id_seq TO prism_app;
