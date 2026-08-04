-- ─────────────────────────────────────────────────────────────────────────────
-- reporting_platform schema — initial tables
-- Run against: crafd database on un80-dev-pg.postgres.database.azure.com
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- Reusable trigger function: keeps updated_at current
CREATE OR REPLACE FUNCTION reporting_platform.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── Partners ──────────────────────────────────────────────────────────────────
CREATE TABLE partners (
    id                   SERIAL       PRIMARY KEY,
    organization_name    TEXT         NOT NULL,
    organization_website TEXT,
    password_hash        TEXT         NOT NULL,
    mail_account         TEXT         NOT NULL UNIQUE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE projects (
    id                   SERIAL       PRIMARY KEY,
    partner_id           INTEGER      NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    project_title        TEXT         NOT NULL,
    mptfo_project_number TEXT,
    grant_size_usd       NUMERIC(15,2),
    project_duration     TEXT,
    geographic_scope     TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX projects_partner_id_idx ON projects(partner_id);

CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Implementing Partners (many-to-many) ─────────────────────────────────────
CREATE TABLE implementing_partners (
    id         SERIAL      PRIMARY KEY,
    project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    partner_id INTEGER     NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, partner_id)
);

CREATE INDEX impl_partners_project_idx ON implementing_partners(project_id);
CREATE INDEX impl_partners_partner_idx ON implementing_partners(partner_id);

-- ── Reports ───────────────────────────────────────────────────────────────────
CREATE TABLE reports (
    id                     SERIAL      PRIMARY KEY,
    project_id             INTEGER     NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    year                   SMALLINT    NOT NULL CHECK (year BETWEEN 2020 AND 2050),
    report_submission_date DATE,
    authorized             BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, year)
);

CREATE INDEX reports_project_id_idx ON reports(project_id);

CREATE TRIGGER reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Indicators (master definitions) ──────────────────────────────────────────
CREATE TABLE indicators (
    id                    SERIAL      PRIMARY KEY,
    indicator_type        TEXT        NOT NULL,
    indicator_title       TEXT        NOT NULL,
    description           TEXT,
    means_of_verification TEXT,
    category              TEXT,
    cycle                 TEXT,
    scope                 TEXT,
    value_type            TEXT        NOT NULL DEFAULT 'Number',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indicator Sections (one row per indicator per report) ─────────────────────
CREATE TABLE indicator_sections (
    id             SERIAL      PRIMARY KEY,
    report_id      INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    indicator_id   INTEGER     NOT NULL REFERENCES indicators(id) ON DELETE RESTRICT,
    baseline_value TEXT,
    target_value   TEXT,
    target_year    SMALLINT,
    achieved_value TEXT,
    status         TEXT        CHECK (status IN (
                       'Ahead of schedule', 'On track', 'Off track', 'Not started', 'N/A'
                   )),
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, indicator_id)
);

CREATE INDEX indicator_sections_report_idx    ON indicator_sections(report_id);
CREATE INDEX indicator_sections_indicator_idx ON indicator_sections(indicator_id);

CREATE TRIGGER indicator_sections_updated_at
    BEFORE UPDATE ON indicator_sections
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Seed standard indicators ─────────────────────────────────────────────────
INSERT INTO indicators (indicator_type, indicator_title, description, means_of_verification, category, cycle, scope, value_type) VALUES
('Standard', 'Funding allocated for crisis action with the support of project outputs',
 'This indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action.',
 'Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.',
 'Investment', 'Yearly', 'Global', 'Number'),
('Standard', 'Funding allocated for crisis action specifically in fragile settings',
 'This sub-indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action specifically in fragile contexts.',
 'Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.',
 'Investment', 'Yearly', 'Global', 'Number'),
('Standard', 'Project partners involved in the implementation of the project',
 'This indicator aims to measure the number of project partners involved in the implementation of the project.',
 'Internal tracking.',
 'Capacity', 'Yearly', 'Global', 'Number'),
('Standard', 'Project partners from fragile and/or crisis-affected settings',
 'This sub-indicator aims to measure the number of project partners specifically from fragile and/or crisis affected settings.',
 'Internal tracking.',
 'Capacity', 'Yearly', 'Global', 'Number'),
('Standard', 'Datasets provided by the project',
 'This indicator aims to measure the provision and dissemination of datasets by the project to stakeholders.',
 'Internal tracking.',
 'Capacity', 'Yearly', 'Global', 'Number');
