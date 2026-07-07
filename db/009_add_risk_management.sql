-- ─────────────────────────────────────────────────────────────────────────────
-- Add risk_management table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE reporting_platform.risk_management (
    id                   SERIAL        PRIMARY KEY,
    report_id            INTEGER       NOT NULL
                           REFERENCES reporting_platform.reports(id)
                           ON DELETE CASCADE,
    risk_name            TEXT          NOT NULL,
    risk_category        TEXT[],
    likelihood           SMALLINT      CHECK (likelihood BETWEEN 1 AND 5),
    impact               SMALLINT      CHECK (impact BETWEEN 1 AND 15),
    approved_mitigation  TEXT,
    updated_mitigation   TEXT,
    project_revision     BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX risk_management_report_id_idx ON reporting_platform.risk_management(report_id);

CREATE TRIGGER risk_management_updated_at
    BEFORE UPDATE ON reporting_platform.risk_management
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
