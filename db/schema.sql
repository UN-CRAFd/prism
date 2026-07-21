-- ─────────────────────────────────────────────────────────────────────────────
-- reporting_platform — consolidated schema (canonical one-shot setup)
--
-- Running this single file against a fresh database reproduces the exact state
-- that the incremental files (db/001–012 + migrations/013–025) leave behind,
-- with the schema drift they never captured folded back in:
--   • partners.short_name / long_name and projects.short_name (added by lost
--     migrations, referenced everywhere in the code)
--   • the `overview` and `surveys` tables (never had a migration; reconstructed
--     from the API queries that read/write them)
--   • indicators / indicator_data as rebuilt by migration 018 (the 001 legacy
--     indicators + indicator_sections tables are gone)
--   • workplan_activities.outcome (renamed from `intermediate` in 019)
--   • projects: no project_duration / project_end_date / workplan_quarter_*
--     columns — start date + project_duration_months only (020 → 025)
--   • reports.status ∈ (Open, Under Review, Closed) (023 → 024)
--
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP TRIGGER guards).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS reporting_platform;
SET search_path TO reporting_platform;

-- Reusable trigger function: keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION reporting_platform.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── Partners ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partners (
    id                   SERIAL       PRIMARY KEY,
    short_name           TEXT         NOT NULL,
    long_name            TEXT,
    organization_website TEXT,
    password_hash        TEXT         NOT NULL,          -- scrypt:<salt>:<hash>
    mail_account         TEXT         NOT NULL UNIQUE,
    password_set_at      TIMESTAMPTZ,                     -- when the partner set their own password via a share link (NULL = not yet)
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Partner contacts (people at a partner org: name, role, email) ────────────
CREATE TABLE IF NOT EXISTS partner_contacts (
    id         SERIAL       PRIMARY KEY,
    partner_id INTEGER      NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    manager_id INTEGER      REFERENCES partner_contacts(id) ON DELETE SET NULL,
    name       TEXT         NOT NULL,
    role       TEXT,
    email      TEXT,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partner_contacts_partner_id_idx ON partner_contacts(partner_id);
CREATE INDEX IF NOT EXISTS partner_contacts_manager_id_idx ON partner_contacts(manager_id);
DROP TRIGGER IF EXISTS partner_contacts_updated_at ON partner_contacts;
CREATE TRIGGER partner_contacts_updated_at
    BEFORE UPDATE ON partner_contacts
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id                      SERIAL        PRIMARY KEY,
    partner_id              INTEGER       NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    project_title           TEXT          NOT NULL,
    short_name              TEXT,
    description             TEXT,
    status                  TEXT          NOT NULL DEFAULT 'Ongoing'
        CHECK (status IN ('Idea', 'Ongoing', 'Operationally Closed', 'Financially Closed', 'Project Closed')),
    mptfo_project_number    TEXT,
    grant_size_usd          NUMERIC(15,2),
    project_start_date      DATE,
    project_duration_months INTEGER,
    geographic_scope        TEXT,
    implementing_partners   TEXT,
    indirect_cost_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.07,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_partner_id_idx ON projects(partner_id);

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project contacts ─────────────────────────────────────────────────────────
-- Links a project to its partner-org contacts (applicants + project contacts),
-- with the nature of the relationship and an applicant flag. One row per pair.
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

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id                     SERIAL      PRIMARY KEY,
    project_id             INTEGER     NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    year                   SMALLINT    NOT NULL CHECK (year BETWEEN 2020 AND 2050),
    report_submission_date DATE,
    authorized             BOOLEAN     NOT NULL DEFAULT FALSE,
    status                 TEXT        NOT NULL DEFAULT 'Open'
                             CHECK (status IN ('Open', 'Closed', 'Under Review')),
    data_type              TEXT        NOT NULL DEFAULT 'report'
                             CHECK (data_type IN ('report', 'prodoc')),
    report_type            TEXT        CHECK (report_type IN ('annual', 'final')),
    mptfo_report_link      TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, year, data_type)
);

CREATE INDEX IF NOT EXISTS reports_project_id_idx ON reports(project_id);

-- Exactly one project document (data_type='prodoc') per project; auto-created
-- alongside the project. Reporting-year rows (data_type='report') are unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_prodoc_per_project
    ON reports (project_id) WHERE data_type = 'prodoc';

DROP TRIGGER IF EXISTS reports_updated_at ON reports;
CREATE TRIGGER reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Overview is not its own table: the project overview shown to partners is
-- assembled from `projects` (title, number, grant, dates, scope, implementing
-- partners, project lead), `partners` (organization name + website) and
-- `reports` (submission date, authorized). Admins enter it on the project;
-- partners see it read-only when editing a report.

-- ── Item comments (admin annotations on any report item) ─────────────────────
-- Polymorphic: (section, item_id) is a soft FK to any section table's row;
-- item_id NULL = a section-level comment. report_id has a real FK so comments
-- cascade with the report and load in one indexed query. Threaded (many per item).
CREATE TABLE IF NOT EXISTS item_comments (
    id         SERIAL       PRIMARY KEY,
    report_id  INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    section    TEXT         NOT NULL,
    item_id    INTEGER,
    body       TEXT         NOT NULL,
    resolved          BOOLEAN NOT NULL DEFAULT FALSE,  -- CRAF'd-side confirmation
    partner_addressed BOOLEAN NOT NULL DEFAULT FALSE,  -- partner-side confirmation
    author     TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS item_comments_lookup_idx ON item_comments (report_id, section, item_id);
DROP TRIGGER IF EXISTS item_comments_updated_at ON item_comments;
CREATE TRIGGER item_comments_updated_at
    BEFORE UPDATE ON item_comments
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Surveys (one row per question per report) ────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
    id         SERIAL      PRIMARY KEY,
    reportid   INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    question   TEXT        NOT NULL,
    assessment SMALLINT    CHECK (assessment BETWEEN 1 AND 5),
    context    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS surveys_reportid_idx ON surveys(reportid);

DROP TRIGGER IF EXISTS surveys_updated_at ON surveys;
CREATE TRIGGER surveys_updated_at
    BEFORE UPDATE ON surveys
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Indicators (master library) ──────────────────────────────────────────────
-- Standard indicators are global (project_id IS NULL); custom indicators are
-- created while editing a report and scoped to that project. archived_at
-- soft-deletes so historical reports never break.
CREATE TABLE IF NOT EXISTS indicators (
    id                    SERIAL      PRIMARY KEY,
    name                  TEXT        NOT NULL,
    description           TEXT,
    means_of_verification TEXT,
    category              TEXT,
    cycle                 TEXT        CHECK (cycle IN ('yearly', 'at_closure')),
    is_standard           BOOLEAN     NOT NULL DEFAULT TRUE,
    project_id            INTEGER     REFERENCES projects(id) ON DELETE CASCADE,
    archived_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ( (is_standard AND project_id IS NULL) OR (NOT is_standard AND project_id IS NOT NULL) )
);

CREATE INDEX IF NOT EXISTS indicators_project_idx ON indicators(project_id);

DROP TRIGGER IF EXISTS indicators_updated_at ON indicators;
CREATE TRIGGER indicators_updated_at
    BEFORE UPDATE ON indicators
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Indicator data (one row per indicator per report) ────────────────────────
CREATE TABLE IF NOT EXISTS indicator_data (
    id             SERIAL      PRIMARY KEY,
    report_id      INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    indicator_id   INTEGER     NOT NULL REFERENCES indicators(id) ON DELETE RESTRICT,
    baseline_value TEXT,
    baseline_year  SMALLINT    CHECK (baseline_year BETWEEN 2000 AND 2050),
    target_value   TEXT,
    target_year    SMALLINT    CHECK (target_year BETWEEN 2000 AND 2050),
    achieved_value TEXT,
    status         TEXT        CHECK (status IN ('on_track', 'off_track', 'ahead_of_schedule')),
    comment        TEXT,
    sort_order     SMALLINT    NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS indicator_data_report_idx    ON indicator_data(report_id);
CREATE INDEX IF NOT EXISTS indicator_data_indicator_idx ON indicator_data(indicator_id);

DROP TRIGGER IF EXISTS indicator_data_updated_at ON indicator_data;
CREATE TRIGGER indicator_data_updated_at
    BEFORE UPDATE ON indicator_data
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Risk management (one row per risk per report) ────────────────────────────
CREATE TABLE IF NOT EXISTS risk_management (
    id                  SERIAL       PRIMARY KEY,
    report_id           INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    risk_name           TEXT         NOT NULL,
    risk_category       TEXT[],
    likelihood          SMALLINT     CHECK (likelihood BETWEEN 1 AND 5),
    impact              SMALLINT     CHECK (impact BETWEEN 1 AND 5),
    approved_mitigation TEXT,
    updated_mitigation  TEXT,
    project_revision    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_management_report_id_idx ON risk_management(report_id);

DROP TRIGGER IF EXISTS risk_management_updated_at ON risk_management;
CREATE TRIGGER risk_management_updated_at
    BEFORE UPDATE ON risk_management
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Qualitative list sections (one set of rows per report) ───────────────────
CREATE TABLE IF NOT EXISTS key_achievements (
    id           SERIAL      PRIMARY KEY,
    report_id    INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    achievement  TEXT,
    significance TEXT,
    links        TEXT,
    sort_order   SMALLINT    NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS key_achievements_report_id_idx ON key_achievements(report_id);
DROP TRIGGER IF EXISTS key_achievements_updated_at ON key_achievements;
CREATE TRIGGER key_achievements_updated_at
    BEFORE UPDATE ON key_achievements
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS partnerships (
    id                   SERIAL      PRIMARY KEY,
    report_id            INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    partner_organization TEXT,
    result               TEXT,
    links                TEXT,
    sort_order           SMALLINT    NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partnerships_report_id_idx ON partnerships(report_id);
DROP TRIGGER IF EXISTS partnerships_updated_at ON partnerships;
CREATE TRIGGER partnerships_updated_at
    BEFORE UPDATE ON partnerships
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS results (
    id                   SERIAL      PRIMARY KEY,
    report_id            INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    context              TEXT,
    data_driven_decision TEXT,
    resulting_impact     TEXT,
    links                TEXT,
    sort_order           SMALLINT    NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS results_report_id_idx ON results(report_id);
DROP TRIGGER IF EXISTS results_updated_at ON results;
CREATE TRIGGER results_updated_at
    BEFORE UPDATE ON results
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS lessons_learned (
    id                  SERIAL      PRIMARY KEY,
    report_id           INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category            TEXT,
    lesson_learned      TEXT,
    adjustment_informed TEXT,
    sort_order          SMALLINT    NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lessons_learned_report_id_idx ON lessons_learned(report_id);
DROP TRIGGER IF EXISTS lessons_learned_updated_at ON lessons_learned;
CREATE TRIGGER lessons_learned_updated_at
    BEFORE UPDATE ON lessons_learned
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS external_coverage (
    id              SERIAL      PRIMARY KEY,
    report_id       INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    type            TEXT,
    description     TEXT,
    reach_indicator TEXT,
    links           TEXT,
    sort_order      SMALLINT    NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS external_coverage_report_id_idx ON external_coverage(report_id);
DROP TRIGGER IF EXISTS external_coverage_updated_at ON external_coverage;
CREATE TRIGGER external_coverage_updated_at
    BEFORE UPDATE ON external_coverage
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Testimonials: one leadership quote (kind='leadership') + up to three partner/
-- user quotes (kind='partner') per report. Per-kind caps enforced in the API.
CREATE TABLE IF NOT EXISTS testimonials (
    id            SERIAL       PRIMARY KEY,
    report_id     INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    kind          TEXT         NOT NULL CHECK (kind IN ('leadership', 'partner')),
    quote         TEXT,
    person_name   TEXT,
    person_title  TEXT,
    photo_label   TEXT,
    photo_link    TEXT,
    photo_credits TEXT,
    sort_order    SMALLINT     NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS testimonials_report_id_idx ON testimonials(report_id);
DROP TRIGGER IF EXISTS testimonials_updated_at ON testimonials;
CREATE TRIGGER testimonials_updated_at
    BEFORE UPDATE ON testimonials
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Workplan: project-level activities + per-report progress entries ─────────
CREATE TABLE IF NOT EXISTS workplan_activities (
    id                 SERIAL       PRIMARY KEY,
    project_id         INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    outcome            TEXT,                                    -- outcome grouping heading
    objective_num      TEXT,
    objective_text     TEXT,
    activity_num       TEXT,
    activity_text      TEXT,
    implementing_agent TEXT,
    planned_quarters   JSONB        NOT NULL DEFAULT '[]',      -- baseline timeline
    sort_order         INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workplan_activities_project_idx ON workplan_activities(project_id);
DROP TRIGGER IF EXISTS workplan_activities_updated_at ON workplan_activities;
CREATE TRIGGER workplan_activities_updated_at
    BEFORE UPDATE ON workplan_activities
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS workplan_entries (
    id               SERIAL       PRIMARY KEY,
    report_id        INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    activity_id      INTEGER      NOT NULL REFERENCES workplan_activities(id) ON DELETE CASCADE,
    updated_quarters JSONB,                                     -- null = same as baseline
    status           TEXT         CHECK (status IN ('Behind Schedule', 'On Track', 'Achieved')),
    comment          TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, activity_id)
);
CREATE INDEX IF NOT EXISTS workplan_entries_report_idx   ON workplan_entries(report_id);
CREATE INDEX IF NOT EXISTS workplan_entries_activity_idx ON workplan_entries(activity_id);
DROP TRIGGER IF EXISTS workplan_entries_updated_at ON workplan_entries;
CREATE TRIGGER workplan_entries_updated_at
    BEFORE UPDATE ON workplan_entries
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Expenditure: category master + approved budgets + actual expenditure ─────
CREATE TABLE IF NOT EXISTS expenditure_categories (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenditure_budgets (
    id              SERIAL       PRIMARY KEY,
    project_id      INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id     INTEGER      NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    year            SMALLINT     NOT NULL,
    approved_amount NUMERIC(15,2),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, category_id, year)
);
CREATE INDEX IF NOT EXISTS expenditure_budgets_project_idx ON expenditure_budgets(project_id);
DROP TRIGGER IF EXISTS expenditure_budgets_updated_at ON expenditure_budgets;
CREATE TRIGGER expenditure_budgets_updated_at
    BEFORE UPDATE ON expenditure_budgets
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS expenditure_entries (
    id                 SERIAL       PRIMARY KEY,
    report_id          INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category_id        INTEGER      NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    annual_expenditure NUMERIC(15,2),
    comment            TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, category_id)
);
CREATE INDEX IF NOT EXISTS expenditure_entries_report_idx ON expenditure_entries(report_id);
DROP TRIGGER IF EXISTS expenditure_entries_updated_at ON expenditure_entries;
CREATE TRIGGER expenditure_entries_updated_at
    BEFORE UPDATE ON expenditure_entries
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Transfers to implementing partners ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_partners (
    id                SERIAL       PRIMARY KEY,
    project_id        INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_name TEXT,
    website           TEXT,
    partner_type      TEXT,
    sort_order        INTEGER      NOT NULL DEFAULT 0,
    archived_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transfer_partners_project_idx ON transfer_partners(project_id);
DROP TRIGGER IF EXISTS transfer_partners_updated_at ON transfer_partners;
CREATE TRIGGER transfer_partners_updated_at
    BEFORE UPDATE ON transfer_partners
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS transfer_data (
    id                  SERIAL       PRIMARY KEY,
    report_id           INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    transfer_partner_id INTEGER      NOT NULL REFERENCES transfer_partners(id) ON DELETE CASCADE,
    amount_transferred  NUMERIC(14,2),
    linked_activity_id  INTEGER      REFERENCES workplan_activities(id) ON DELETE SET NULL,
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, transfer_partner_id)
);
CREATE INDEX IF NOT EXISTS transfer_data_report_idx  ON transfer_data(report_id);
CREATE INDEX IF NOT EXISTS transfer_data_partner_idx ON transfer_data(transfer_partner_id);
DROP TRIGGER IF EXISTS transfer_data_updated_at ON transfer_data;
CREATE TRIGGER transfer_data_updated_at
    BEFORE UPDATE ON transfer_data
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Complementary funding ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complementary_contributors (
    id               SERIAL       PRIMARY KEY,
    project_id       INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contributor_name TEXT,
    website          TEXT,
    funding_type     TEXT         CHECK (funding_type IN ('In Cash', 'In Kind')),
    sort_order       INTEGER      NOT NULL DEFAULT 0,
    archived_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS complementary_contributors_project_idx ON complementary_contributors(project_id);
DROP TRIGGER IF EXISTS complementary_contributors_updated_at ON complementary_contributors;
CREATE TRIGGER complementary_contributors_updated_at
    BEFORE UPDATE ON complementary_contributors
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS complementary_data (
    id                  SERIAL       PRIMARY KEY,
    report_id           INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    contributor_id      INTEGER      NOT NULL REFERENCES complementary_contributors(id) ON DELETE CASCADE,
    contribution_amount NUMERIC(14,2),
    linked_activity_ids JSONB        NOT NULL DEFAULT '[]',     -- array of workplan_activity ids
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, contributor_id)
);
CREATE INDEX IF NOT EXISTS complementary_data_report_idx      ON complementary_data(report_id);
CREATE INDEX IF NOT EXISTS complementary_data_contributor_idx ON complementary_data(contributor_id);
DROP TRIGGER IF EXISTS complementary_data_updated_at ON complementary_data;
CREATE TRIGGER complementary_data_updated_at
    BEFORE UPDATE ON complementary_data
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project narratives ───────────────────────────────────────────────────────
-- Project-level proposal narratives (Background & Relevance, Theory of Change,
-- CRAF'd Principles, Methodology, …). One row per (project, narrative_key); the
-- question label for each key lives in labels.json so the set can evolve in code.
CREATE TABLE IF NOT EXISTS project_narratives (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    narrative_key TEXT         NOT NULL,
    answer        TEXT,
    comment       TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, narrative_key)
);
CREATE INDEX IF NOT EXISTS project_narratives_project_idx ON project_narratives(project_id);
DROP TRIGGER IF EXISTS project_narratives_updated_at ON project_narratives;
CREATE TRIGGER project_narratives_updated_at
    BEFORE UPDATE ON project_narratives
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data
-- ─────────────────────────────────────────────────────────────────────────────

-- Standard MPTFO expenditure categories (global master list).
-- Guarded so a re-run never duplicates (there is no UNIQUE on name).
INSERT INTO expenditure_categories (name, sort_order)
SELECT v.name, v.sort_order
  FROM (VALUES
    ('Staff and other personnel',              1),
    ('Supplies, commodities, materials',       2),
    ('Equipment, vehicles, & furniture',       3),
    ('Contractual services',                   4),
    ('Travel',                                 5),
    ('Transfers & grants to counterparts',     6),
    ('General operating & other direct costs', 7)
  ) AS v(name, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM expenditure_categories);

-- Standard (global) indicators — the library every project starts from.
INSERT INTO indicators (name, description, means_of_verification, category, cycle, is_standard, project_id)
SELECT v.name, v.description, v.means_of_verification, v.category, v.cycle, TRUE, NULL
  FROM (VALUES
    ('Funding allocated for crisis action with the support of project outputs',
     'This indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action.',
     'Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.',
     'Investment', 'yearly'),
    ('Funding allocated for crisis action specifically in fragile settings',
     'This sub-indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action specifically in fragile contexts.',
     'Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.',
     'Investment', 'yearly'),
    ('Project partners involved in the implementation of the project',
     'This indicator aims to measure the number of project partners involved in the implementation of the project.',
     'Internal tracking.',
     'Capacity', 'yearly'),
    ('Project partners from fragile and/or crisis-affected settings',
     'This sub-indicator aims to measure the number of project partners specifically from fragile and/or crisis affected settings.',
     'Internal tracking.',
     'Capacity', 'yearly'),
    ('Datasets provided by the project',
     'This indicator aims to measure the provision and dissemination of datasets by the project to stakeholders.',
     'Internal tracking.',
     'Capacity', 'yearly')
  ) AS v(name, description, means_of_verification, category, cycle)
 WHERE NOT EXISTS (SELECT 1 FROM indicators WHERE is_standard);
