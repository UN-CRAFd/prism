-- HACT recommendations (project updates)
--
-- The HACT Recommendations page on a project update is a table CRAF'd fills in:
-- one row per finding, numbered, with the recommendation made against it and
-- its status. The partner answers each one in `partner_comment` — the only
-- column a partner may write; every other column, and adding or removing rows,
-- is admin-only (enforced in /api/hact-recommendations).
--
-- Report-scoped like every other section table, so ownership and the
-- Open-status edit gate work through the existing authz helpers.

CREATE TABLE IF NOT EXISTS reporting_platform.hact_recommendations (
    id              SERIAL       PRIMARY KEY,
    report_id       INTEGER      NOT NULL REFERENCES reporting_platform.reports(id) ON DELETE CASCADE,
    number          TEXT         NOT NULL DEFAULT '',
    finding         TEXT         NOT NULL DEFAULT '',
    recommendation  TEXT         NOT NULL DEFAULT '',
    partner_comment TEXT         NOT NULL DEFAULT '',
    status          TEXT,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hact_recommendations_report_idx
    ON reporting_platform.hact_recommendations (report_id);

DROP TRIGGER IF EXISTS hact_recommendations_updated_at ON reporting_platform.hact_recommendations;
CREATE TRIGGER hact_recommendations_updated_at
    BEFORE UPDATE ON reporting_platform.hact_recommendations
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON reporting_platform.hact_recommendations TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE reporting_platform.hact_recommendations_id_seq TO prism_app;
