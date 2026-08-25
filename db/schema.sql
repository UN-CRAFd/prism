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

-- ── ENUM Types ──────────────────────────────────────────────────────────────
-- Dropdown choice columns (project/report status, report type, indicator
-- category/cycle, workplan status, funding type, document/partner type, lessons
-- category, external-coverage type, contact role, SDG priority) are plain TEXT
-- rather than ENUM/CHECK, because their allowed values are admin-editable at
-- runtime via Settings → Dropdown options (see src/lib/options.ts). The app is
-- the single source of truth for the option lists; the DB only stores the text.
-- (Existing databases: run db/make-dropdowns-editable.sql to drop the old
-- enums/checks.)
DO $$ BEGIN
    CREATE TYPE data_type_enum AS ENUM (
        'report',
        'prodoc'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reusable trigger function: keeps updated_at current on every UPDATE.
-- Single source of truth: derive project year range from start_date + duration_months.
-- Used by expenditure, workplan, and any other feature needing consistent year calculation.
CREATE OR REPLACE FUNCTION reporting_platform.project_year_range(
  start_date DATE, duration_months INT
) RETURNS INT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY_AGG(DISTINCT EXTRACT(YEAR FROM (start_date + (n * INTERVAL '1 month'))::date)::int
    ORDER BY EXTRACT(YEAR FROM (start_date + (n * INTERVAL '1 month'))::date)::int)
  FROM GENERATE_SERIES(0, GREATEST(COALESCE(duration_months, 12), 1) - 1) AS n;
$$;

-- Single source of truth: derive project end date.
-- Used by workplan quarter range, and any other feature needing project end date.
CREATE OR REPLACE FUNCTION reporting_platform.project_end_date(
  start_date DATE, duration_months INT
) RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT (start_date + (GREATEST(COALESCE(duration_months, 12), 1) * INTERVAL '1 month'))::date;
$$;

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
    short_name           VARCHAR(50)  NOT NULL,
    long_name            VARCHAR(500),
    organization_website TEXT,
    password_hash        TEXT         NOT NULL,          -- scrypt:<salt>:<hash>
    mail_account         TEXT         UNIQUE,             -- optional; login also works by short_name (NULLs allowed, not unique-constrained)
    password_set_at      TIMESTAMPTZ,                     -- when the partner set their own password via a share link (NULL = not yet)
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- short_name is a login identifier: the login query matches `lower(short_name)`
-- with LIMIT 1, so two rows differing only in case ("ACME" / "acme") would make
-- login pick an arbitrary account. Enforce case-insensitive uniqueness. (Fails
-- to apply if existing data already holds such duplicates — dedupe first.)
CREATE UNIQUE INDEX IF NOT EXISTS partners_short_name_lower_uq
    ON partners (lower(short_name));

DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Partner contacts (people at a partner org: name, role, email) ────────────
CREATE TABLE IF NOT EXISTS partner_contacts (
    id         SERIAL       PRIMARY KEY,
    partner_id INTEGER      NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    organization VARCHAR(200),
    role         VARCHAR(100),
    email        TEXT,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partner_contacts_partner_id_idx ON partner_contacts(partner_id);
DROP TRIGGER IF EXISTS partner_contacts_updated_at ON partner_contacts;
CREATE TRIGGER partner_contacts_updated_at
    BEFORE UPDATE ON partner_contacts
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id                      SERIAL        PRIMARY KEY,
    partner_id              INTEGER       NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
    project_title           VARCHAR(500)  NOT NULL,
    short_name              VARCHAR(50),
    description             TEXT,
    status                  TEXT           NOT NULL DEFAULT 'Ongoing',
    mptfo_project_number    TEXT,
    grant_size_usd          NUMERIC(15,2),
    project_start_date      DATE,
    project_duration_months INTEGER,
    geographic_scope        TEXT,
    keyword                      TEXT,
    universal_markers       TEXT,
    optional_markers        TEXT,
    fund_specific_markers   TEXT,
    indirect_cost_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.07,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_partner_id_idx ON projects(partner_id);

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project editors (implementing partners with edit rights) ─────────────────
-- A project has one OWNER (projects.partner_id, the project lead). This junction
-- grants ADDITIONAL partners edit rights on the project's PRODOC only (never its
-- reports). Authorization widens the project-scoped ownership checks
-- (guardProject / guardProjectRow) to include partners listed here.
CREATE TABLE IF NOT EXISTS project_editors (
    project_id  INTEGER      NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    partner_id  INTEGER      NOT NULL REFERENCES partners(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, partner_id)
);
CREATE INDEX IF NOT EXISTS project_editors_partner_idx ON project_editors(partner_id);

-- ── Project contacts ─────────────────────────────────────────────────────────
-- Links a project to its partner-org contacts (applicants + project contacts),
-- with the nature of the relationship and an applicant flag. One row per pair.
CREATE TABLE IF NOT EXISTS project_contacts (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contact_id   INTEGER      NOT NULL REFERENCES partner_contacts(id) ON DELETE CASCADE,
    relationship TEXT,
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

-- ── Project organizations (participating and implementing) ───────────────────
-- Normalised list replacing the former implementing_partners and
-- participating_organizations TEXT columns. One row per organization, with
-- `type` distinguishing the two categories. sort_order controls display order.
-- A tranche grid will later reference these rows as its row dimension.
CREATE TABLE IF NOT EXISTS project_organizations (
    id         SERIAL       PRIMARY KEY,
    project_id INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       VARCHAR(300) NOT NULL,
    type       VARCHAR(30)  NOT NULL CHECK (type IN ('participating', 'implementing')),
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_organizations_project_id_idx ON project_organizations(project_id);
DROP TRIGGER IF EXISTS project_organizations_updated_at ON project_organizations;
CREATE TRIGGER project_organizations_updated_at
    BEFORE UPDATE ON project_organizations
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project extensions (no-cost extension history) ───────────────────────────
-- One row per no-cost extension granted on a project: months added plus a
-- snapshot of the duration before/after (so the log survives later direct edits
-- to the duration) and an optional reason. projects.project_duration_months
-- stays the single source of truth for the total period; this is the audit trail.
CREATE TABLE IF NOT EXISTS project_extensions (
    id                        SERIAL       PRIMARY KEY,
    project_id                INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    months_added              INTEGER      NOT NULL CHECK (months_added > 0),
    previous_duration_months  INTEGER      NOT NULL,
    new_duration_months       INTEGER      NOT NULL,
    note                      TEXT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_extensions_project_id_idx ON project_extensions(project_id);

-- ── Project revisions (revision history) ─────────────────────────────────────
-- A logged project-revision event: the date it was revised plus an optional
-- comment. Purely an audit record — unlike an extension it changes nothing
-- derived (no period / budget / workplan impact). Cascade-deleted with the project.
CREATE TABLE IF NOT EXISTS project_revisions (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision_date DATE         NOT NULL,
    comment       TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_revisions_project_id_idx ON project_revisions(project_id);

-- ── Project tranches (grant disbursement schedule) ───────────────────────────
-- Subdivides the grant (projects.grant_size_usd) into one or more disbursement
-- tranches, each with an amount, a date and an optional comment. Edited on the
-- project document's General Information tab by both the admin and partner
-- sides. The amounts are intended to sum to the grant size (a soft rule
-- enforced in the UI, not the DB). Cascade-deleted with the project.
CREATE TABLE IF NOT EXISTS project_tranches (
    id            SERIAL        PRIMARY KEY,
    project_id    INTEGER       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    amount        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    tranche_date  DATE,
    comment       TEXT,
    sort_order    INTEGER       NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_tranches_project_idx ON project_tranches(project_id);
DROP TRIGGER IF EXISTS project_tranches_updated_at ON project_tranches;
CREATE TRIGGER project_tranches_updated_at
    BEFORE UPDATE ON project_tranches
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id                     SERIAL         PRIMARY KEY,
    project_id             INTEGER        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    year                   SMALLINT       NOT NULL CHECK (year BETWEEN 2020 AND 2050),
    report_submission_date DATE,
    authorized             BOOLEAN        NOT NULL DEFAULT FALSE,
    status                 TEXT           NOT NULL DEFAULT 'Open',
    data_type              data_type_enum NOT NULL DEFAULT 'report'::data_type_enum,
    report_type            TEXT,
    mptfo_report_link      TEXT,
    created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
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
-- `section` is a free-form key set by the client (report/prodoc section tabs plus
-- sub-tab anchors like 'overview', 'transfers', 'complementary', 'signatures'), so
-- it is TEXT rather than a fixed enum.
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
-- Only reporting-year rows (data_type='report') carry surveys; prodocs do not.
-- Seeded at report creation from standard_survey_questions or the prior annual
-- report (see seedReportSurveys in /api/reports).
CREATE TABLE IF NOT EXISTS surveys (
    id         SERIAL      PRIMARY KEY,
    report_id  INTEGER     NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    question   TEXT        NOT NULL,
    assessment SMALLINT    CHECK (assessment BETWEEN 1 AND 5),
    context    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, question)
);

CREATE INDEX IF NOT EXISTS surveys_report_id_idx ON surveys(report_id);

DROP TRIGGER IF EXISTS surveys_updated_at ON surveys;
CREATE TRIGGER surveys_updated_at
    BEFORE UPDATE ON surveys
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Standard survey questions (global library, keyed by report type) ─────────
-- Admin-authored questions that seed a project's report survey chain, across all
-- projects: one set for annual reports, one for final reports. Snapshotted into
-- surveys(report_id, question) at report creation (see seedReportSurveys in
-- /api/reports): a final report copies the FINAL set; a project's first annual
-- report copies the ANNUAL set; each later annual report instead copies the
-- previous annual report's questions, so edits carry forward. Surveys are not
-- stored on the prodoc.
CREATE TABLE IF NOT EXISTS standard_survey_questions (
    id          SERIAL           PRIMARY KEY,
    report_type TEXT NOT NULL,
    question    TEXT             NOT NULL,
    sort_order  INTEGER          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    UNIQUE (report_type, question)
);

CREATE INDEX IF NOT EXISTS standard_survey_questions_type_idx
    ON standard_survey_questions(report_type);

DROP TRIGGER IF EXISTS standard_survey_questions_updated_at ON standard_survey_questions;
CREATE TRIGGER standard_survey_questions_updated_at
    BEFORE UPDATE ON standard_survey_questions
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Standard narrative questions (global library) ────────────────────────────
-- Admin-authored library of project-document narrative questions (Background &
-- Relevance, Theory of Change, …). Snapshotted into project_narratives at project
-- creation (see /api/projects): every new project copies the current set — key,
-- label and sort_order — so partners have a set to fill out and later edits to the
-- library leave existing projects untouched. Mirrors standard_survey_questions.
CREATE TABLE IF NOT EXISTS standard_narrative_questions (
    id            SERIAL      PRIMARY KEY,
    narrative_key TEXT        NOT NULL UNIQUE,
    label         TEXT        NOT NULL,
    description   TEXT,
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS standard_narrative_questions_updated_at ON standard_narrative_questions;
CREATE TRIGGER standard_narrative_questions_updated_at
    BEFORE UPDATE ON standard_narrative_questions
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Seed with the default question set (idempotent).
INSERT INTO standard_narrative_questions (narrative_key, label, sort_order) VALUES
    ('background_relevance', 'Background & Relevance', 1),
    ('theory_of_change',     'Theory of Change', 2),
    ('crafd_principles',     'Alignment with and Commitment to CRAF''d Principles', 3),
    ('methodology',          'Methodology', 4),
    ('ecosystem_impact',     'CRAF''d Data Ecosystem Impact & Use Cases', 5),
    ('sustainability',       'Sustainability', 6),
    ('scalability',          'Scalability', 7),
    ('innovation',           'Innovation', 8),
    ('cost_effectiveness',   'Cost Effectiveness', 9)
ON CONFLICT (narrative_key) DO NOTHING;

-- ── Indicators (master library) ──────────────────────────────────────────────
-- A single global vocabulary of indicators. `is_standard` is the only
-- distinction: standard indicators are seeded into every prodoc by default,
-- while custom ones (is_standard=false) are created while editing and then
-- searchable/reusable from any project. Indicators are NOT project-scoped — the
-- reference direction is one-way: reports/prodocs point at an indicator via
-- indicator_data, never the reverse. archived_at soft-deletes so historical
-- reports never break.
CREATE TABLE IF NOT EXISTS indicators (
    id                    SERIAL                  PRIMARY KEY,
    name                  TEXT                    NOT NULL,
    description           TEXT,
    means_of_verification TEXT,
    category              TEXT,
    cycle                 TEXT,
    is_standard           BOOLEAN                 NOT NULL DEFAULT TRUE,
    archived_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS indicators_updated_at ON indicators;
CREATE TRIGGER indicators_updated_at
    BEFORE UPDATE ON indicators
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Indicator data (one row per indicator per report) ────────────────────────
CREATE TABLE IF NOT EXISTS indicator_data (
    id             SERIAL         PRIMARY KEY,
    report_id      INTEGER        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    indicator_id   INTEGER        NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
    baseline_value TEXT,
    baseline_year  SMALLINT       CHECK (baseline_year BETWEEN 2000 AND 2050),
    target_value   TEXT,
    target_year    SMALLINT       CHECK (target_year BETWEEN 2000 AND 2050),
    achieved_value TEXT,
    status         TEXT,
    comment        TEXT,
    sort_order     SMALLINT       NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
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
    likelihood          SMALLINT     CHECK (likelihood BETWEEN 1 AND 5),
    impact              SMALLINT     CHECK (impact BETWEEN 1 AND 5),
    approved_mitigation TEXT,
    updated_mitigation  TEXT,
    project_revision    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_management_report_id_idx ON risk_management(report_id);

-- ── Risk categories (normalized from TEXT[] array) ──────────────────────────
CREATE TABLE IF NOT EXISTS risk_categories (
    id         SERIAL       PRIMARY KEY,
    risk_id    INTEGER      NOT NULL REFERENCES risk_management(id) ON DELETE CASCADE,
    category   TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (risk_id, category)
);

CREATE INDEX IF NOT EXISTS risk_categories_risk_id_idx ON risk_categories(risk_id);

DROP TRIGGER IF EXISTS risk_management_updated_at ON risk_management;
CREATE TRIGGER risk_management_updated_at
    BEFORE UPDATE ON risk_management
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

DROP TRIGGER IF EXISTS risk_categories_updated_at ON risk_categories;
CREATE TRIGGER risk_categories_updated_at
    BEFORE UPDATE ON risk_categories
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
    -- The photo is EITHER an external URL (photo_link) OR an uploaded file stored
    -- as bytes below (same bytea mechanism as project_documents). Mutually
    -- exclusive: setting one clears the other (enforced in the API).
    photo_link    TEXT,
    photo_content    BYTEA,
    photo_mime_type  TEXT,
    photo_file_name  TEXT,
    photo_size_bytes INTEGER,
    photo_credits TEXT,
    sort_order    SMALLINT     NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Idempotent add for databases created before uploaded testimonial photos existed.
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_content    BYTEA;
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_mime_type  TEXT;
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_file_name  TEXT;
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_size_bytes INTEGER;
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

-- Admin-managed "update windows": labelled progress snapshots per project,
-- [YEAR]+[TR/NCE/BR/AR/FR]. One window per project is active (the only one
-- partners may edit); windows can be hidden from partners. Progress rows attach
-- here, decoupled from reports (report_id on workplan_entries is provenance only).
CREATE TABLE IF NOT EXISTS workplan_updates (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    year        INTEGER      NOT NULL,
    type_code   TEXT         NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT FALSE,
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workplan_updates_project_idx ON workplan_updates(project_id);
-- At most one active window per project.
CREATE UNIQUE INDEX IF NOT EXISTS workplan_updates_one_active_uq
    ON workplan_updates(project_id) WHERE is_active;
DROP TRIGGER IF EXISTS workplan_updates_updated_at ON workplan_updates;
CREATE TRIGGER workplan_updates_updated_at
    BEFORE UPDATE ON workplan_updates
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

CREATE TABLE IF NOT EXISTS workplan_entries (
    id               SERIAL       PRIMARY KEY,
    update_id        INTEGER      NOT NULL REFERENCES workplan_updates(id) ON DELETE CASCADE,
    report_id        INTEGER      REFERENCES reports(id) ON DELETE SET NULL,  -- write provenance
    activity_id      INTEGER      NOT NULL REFERENCES workplan_activities(id) ON DELETE CASCADE,
    updated_quarters JSONB,                                     -- null = same as baseline
    -- Progress scale (best → worst). TEXT + CHECK rather than an enum so the label
    -- set lives in one place (src/lib/workplan.ts) and stays easy to evolve.
    status           TEXT,
    comment          TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (update_id, activity_id)
);
CREATE INDEX IF NOT EXISTS workplan_entries_update_idx   ON workplan_entries(update_id);
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

-- Category names must be unique — they are the human-facing key and duplicates
-- would produce ambiguous budget/expenditure rows. (Fails to apply if existing
-- data already holds duplicates — dedupe first.)
CREATE UNIQUE INDEX IF NOT EXISTS expenditure_categories_name_uq
    ON expenditure_categories (name);

CREATE TABLE IF NOT EXISTS expenditure_budgets (
    id              SERIAL       PRIMARY KEY,
    project_id      INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id     INTEGER      NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    year            SMALLINT     NOT NULL,
    approved_amount NUMERIC(15,2),
    -- Optional admin note explaining what a given category×year budget covers
    -- (e.g. "Travel 2026: field visits to 3 sites"). Surfaces read-only in the
    -- report editor and the printed project document.
    description     TEXT,
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
    -- Actuals only. Approved amounts live in expenditure_budgets, and every
    -- reader (the expenditure matrix API, admin Full Data, the ZIP export)
    -- joins budgets at read time on (project, category, reports.year), so no
    -- approved/variance copy is stored on this row. Migrations 015/016 tried
    -- to add approved_amount / variance / variance_percent as GENERATED
    -- columns wrapping subqueries; PostgreSQL rejects subqueries in generation
    -- expressions (any version), so those ADDs can never have applied as
    -- written and no app code writes or reads such columns (all inserts list
    -- report_id / category_id / annual_expenditure / comment only). See
    -- db/archive/db-incremental/016_drop_expenditure_entries_year.sql.
    annual_expenditure NUMERIC(15,2) CHECK (annual_expenditure IS NULL OR annual_expenditure >= 0),
    comment            TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, category_id)
);
CREATE INDEX IF NOT EXISTS expenditure_entries_report_idx ON expenditure_entries(report_id);
CREATE INDEX IF NOT EXISTS expenditure_entries_category_idx ON expenditure_entries(category_id)
    WHERE annual_expenditure IS NOT NULL;
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
    id               SERIAL            PRIMARY KEY,
    project_id       INTEGER           NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contributor_name TEXT,
    website          TEXT,
    funding_type     TEXT,
    sort_order       INTEGER           NOT NULL DEFAULT 0,
    archived_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
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

-- A contribution can support several workplan activities (many-to-many). Real FKs
-- (unlike the former linked_activity_ids JSONB array) keep referential integrity;
-- ON DELETE CASCADE drops the link when either the contribution or the activity
-- is removed. Mirrors risk_categories / transfer_data.linked_activity_id. (016/017)
CREATE TABLE IF NOT EXISTS complementary_data_activities (
    complementary_data_id INTEGER NOT NULL REFERENCES complementary_data(id)  ON DELETE CASCADE,
    activity_id           INTEGER NOT NULL REFERENCES workplan_activities(id)  ON DELETE CASCADE,
    PRIMARY KEY (complementary_data_id, activity_id)
);
CREATE INDEX IF NOT EXISTS complementary_data_activities_activity_idx
    ON complementary_data_activities(activity_id);

-- ── Project narratives ───────────────────────────────────────────────────────
-- Project-level proposal narratives (Background & Relevance, Theory of Change,
-- CRAF'd Principles, Methodology, …). One row per (project, narrative_key),
-- snapshotted from standard_narrative_questions at project creation. `label` and
-- `sort_order` are copied onto the row so the project keeps its own self-contained
-- set even after the library question is edited or removed (same contract as
-- surveys copying standard_survey_questions.question).
CREATE TABLE IF NOT EXISTS project_narratives (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    narrative_key TEXT         NOT NULL,
    label         TEXT,
    description   TEXT,
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    answer        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, narrative_key)
);
CREATE INDEX IF NOT EXISTS project_narratives_project_idx ON project_narratives(project_id);
DROP TRIGGER IF EXISTS project_narratives_updated_at ON project_narratives;
CREATE TRIGGER project_narratives_updated_at
    BEFORE UPDATE ON project_narratives
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project SDG targets ──────────────────────────────────────────────────────
-- The SDG Target focus of a project: selected SDG targets (sub-indicators of
-- goals 1–17), each with a focus percentage meant to sum to 100% across the
-- project (soft rule, enforced in the UI). Project-level, shared by both sides.
-- The goal/target catalogue lives in code (src/lib/sdg.ts), so target_code is
-- stored free-form.
CREATE TABLE IF NOT EXISTS project_sdg_targets (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sdg_goal     SMALLINT     NOT NULL CHECK (sdg_goal BETWEEN 1 AND 17),
    target_code  TEXT         NOT NULL,
    percentage   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
    priority     TEXT         NOT NULL DEFAULT 'primary',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, target_code)
);
CREATE INDEX IF NOT EXISTS project_sdg_targets_project_idx ON project_sdg_targets(project_id);
DROP TRIGGER IF EXISTS project_sdg_targets_updated_at ON project_sdg_targets;
CREATE TRIGGER project_sdg_targets_updated_at
    BEFORE UPDATE ON project_sdg_targets
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project document signatures ──────────────────────────────────────────────
-- Sign-off on the project document by two parties: 'contact' (a project contact,
-- signed by the partner or an admin) and 'secretariat' (the CRAF'd Secretariat,
-- signed by an admin only — no people table, so no contact_id). Click-to-sign:
-- signing inserts a row, un-signing deletes it. Renders on the exported prodoc.
CREATE TABLE IF NOT EXISTS prodoc_signatures (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    party       TEXT         NOT NULL CHECK (party IN ('contact', 'secretariat')),
    contact_id  INTEGER      REFERENCES partner_contacts(id) ON DELETE CASCADE,
    signed_by   TEXT,
    signed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (
        (party = 'contact' AND contact_id IS NOT NULL)
     OR (party = 'secretariat' AND contact_id IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS prodoc_signatures_contact_uidx
    ON prodoc_signatures(project_id, contact_id) WHERE party = 'contact';
CREATE UNIQUE INDEX IF NOT EXISTS prodoc_signatures_secretariat_uidx
    ON prodoc_signatures(project_id) WHERE party = 'secretariat';
CREATE INDEX IF NOT EXISTS prodoc_signatures_project_idx ON prodoc_signatures(project_id);
DROP TRIGGER IF EXISTS prodoc_signatures_updated_at ON prodoc_signatures;
CREATE TRIGGER prodoc_signatures_updated_at
    BEFORE UPDATE ON prodoc_signatures
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Project documents / annexes ──────────────────────────────────────────────
-- Partner-uploaded documents attached to the project document (annexes, budgets,
-- agreements, …). Project-scoped. The file bytes live in the `content` bytea
-- column — the app has no external blob store, so uploads are capped small
-- (enforced in the API, not the DB). NEVER SELECT content in list queries; it is
-- read only by the single-file download route. doc_type is validated against the
-- fixed list in src/lib/documents.ts (kept as TEXT so the list can evolve).
CREATE TABLE IF NOT EXISTS project_documents (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type    TEXT         NOT NULL,
    doc_date    DATE,
    file_name   TEXT         NOT NULL,
    mime_type   TEXT,
    size_bytes  INTEGER      NOT NULL,
    content     BYTEA        NOT NULL,
    uploaded_by TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents(project_id);
DROP TRIGGER IF EXISTS project_documents_updated_at ON project_documents;
CREATE TRIGGER project_documents_updated_at
    BEFORE UPDATE ON project_documents
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Wiki / Guide sections ────────────────────────────────────────────────────
-- The partner-facing Guide content, editable by admins from /admin/guide. Each
-- row is one section: a stable `slug` (the on-page anchor id), a `title`, an
-- allowlisted lucide `icon` name (see src/lib/wiki.ts), and a rich-text
-- `body_html` (sanitized on write in the API, rendered via toDisplayHtml).
-- Content is global (not project-scoped). Seed lives in the Seed data section.
CREATE TABLE IF NOT EXISTS wiki_sections (
    id          SERIAL       PRIMARY KEY,
    slug        TEXT         NOT NULL UNIQUE,
    title       TEXT         NOT NULL,
    icon        TEXT,
    body_html   TEXT         NOT NULL DEFAULT '',
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wiki_sections_order_idx ON wiki_sections(sort_order, id);
DROP TRIGGER IF EXISTS wiki_sections_updated_at ON wiki_sections;
CREATE TRIGGER wiki_sections_updated_at
    BEFORE UPDATE ON wiki_sections
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── App settings ─────────────────────────────────────────────────────────────
-- Small key/value store for runtime-editable configuration that must survive a
-- redeploy (env vars cannot be changed from within the running app). Currently
-- holds the admin login password hash under key 'admin_password_hash', set from
-- the admin Settings page. Admin login falls back to the ADMIN_PASSWORD env var
-- until a hash is stored here (see src/lib/admin-settings.ts).
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT         PRIMARY KEY,
    value       TEXT         NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
    BEFORE UPDATE ON app_settings
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
INSERT INTO indicators (name, description, means_of_verification, category, cycle, is_standard)
SELECT v.name, v.description, v.means_of_verification, v.category, v.cycle, TRUE
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

-- Wiki / Guide sections. Faithful HTML conversion of the original hardcoded
-- Guide pages. Bodies are dollar-quoted ($WIKI$) so the embedded HTML/quotes
-- need no escaping. Idempotent via ON CONFLICT (slug). Keep identical to the
-- seed in db/archive/migrations/051_wiki_sections.sql.
INSERT INTO wiki_sections (slug, title, icon, sort_order, body_html) VALUES
('introduction', 'Introduction', 'BookOpen', 1, $WIKI$
<p><strong>PRISM</strong> is a tool designed to streamline the creation and submission of Project Documents (ProDoc) and annual reports. Once your project document is reviewed and signed by all relevant parties, it initiates the funding disbursements. Please reach out to the CRAF'd Secretariat with any questions.</p>
<h3>What you'll do in PRISM</h3>
<ul>
<li><strong>Create a ProDoc</strong> — Fill in your project's core reference document with general info, narratives, risks, indicators, workplan, and budget.</li>
<li><strong>Submit Reports</strong> — Each year, complete 14 sections covering qualitative progress and quantitative data, then authorize your submission.</li>
<li><strong>Respond to Feedback</strong> — CRAF'd reviewers may leave comments on specific sections; reply or edit directly from the platform.</li>
</ul>
<p>For questions about report content or deadlines, contact your CRAF'd programme officer at <a href="mailto:crafd@un.org">crafd@un.org</a>.</p>
$WIKI$),
('getting-started', 'Getting Started', 'LogIn', 2, $WIKI$
<p>PRISM is a web application — there is nothing to install. You access it in your browser using the credentials CRAF'd provides. This section covers logging in and finding your way around.</p>
<ol>
<li><strong>Log in.</strong> Open the PRISM login page and enter the <strong>username</strong> and <strong>password</strong> issued by CRAF'd. Passwords are case-sensitive. If you have lost your credentials, contact your CRAF'd programme officer to request a reset.</li>
<li><strong>Or use a secure link.</strong> When CRAF'd opens a new report for you, they may send a <strong>secure link</strong> by email that takes you straight to that report — no separate login needed. These links are personal to you; please don't forward them.</li>
<li><strong>Get your bearings.</strong> Everything is reached from the <strong>left sidebar</strong>. The panel at the bottom shows your organization and a <strong>log-out</strong> button. Use the small arrow on the sidebar edge to collapse or expand it for more screen space.</li>
</ol>
<h3>What's in the sidebar</h3>
<table><thead><tr><th>Menu item</th><th>What it's for</th></tr></thead><tbody>
<tr><td>Home</td><td>Your landing page — project timeline, upcoming report deadlines, and any comments CRAF'd has left for you.</td></tr>
<tr><td>Project Document</td><td>Your project's core reference document (ProDoc). Complete this before funding can be disbursed.</td></tr>
<tr><td>Report Editor</td><td>Your annual and final reports, grouped by project and year. Where you report progress each period.</td></tr>
<tr><td>Contact Information</td><td>Manage your organization's team contacts, their roles, and email addresses.</td></tr>
<tr><td>Guide</td><td>This documentation. Use the sub-links to jump to any topic.</td></tr>
</tbody></table>
<p><strong>Best experience:</strong> PRISM works in any modern browser (Chrome, Edge, Firefox, or Safari). Keep your browser up to date, and make sure you have a stable internet connection so your work saves reliably.</p>
$WIKI$),
('project-document', 'Project Document', 'FileText', 3, $WIKI$
<p>The <strong>Project Document (ProDoc)</strong> is your project's core reference document. Access it via <strong>Project Document</strong> in the left sidebar. It must be completed before your project's funding disbursement can be initiated.</p>
<table><thead><tr><th>Section</th><th>What to fill in</th><th>Required</th></tr></thead><tbody>
<tr><td>General Information</td><td>Project title, start date, and duration in months. Must be completed before other sections are fully editable.</td><td>Yes</td></tr>
<tr><td>Narratives</td><td>Several predetermined text boxes — hover each title for detailed instructions. Include hyperlinks to publicly accessible documents.</td><td>Yes</td></tr>
<tr><td>Indicators</td><td>The standard CRAF'd indicators are already listed for you — remove any that are not relevant to your project, and add your own custom indicators if needed. For each, set the baseline year and value and the target year and value. Used to track progress in annual reports.</td><td>Yes</td></tr>
<tr><td>Risk Management</td><td>Potential risks with category (Social/Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic) and mitigating measures.</td><td>Recommended</td></tr>
<tr><td>Budgets</td><td>Budgets per participating organization, disaggregated by year, in compliance with UNSDG Budget Categories. Must equal the total approved project amount.</td><td>Yes</td></tr>
<tr><td>Workplan</td><td>Quarter-grid showing outcomes, outputs, and activities from RBM as rows. Tick the quarters in which each item is planned.</td><td>Yes</td></tr>
<tr><td>Signatures</td><td>Sign off on the completed Project Document. See the dedicated Signatures section of this guide for the full workflow.</td><td>Yes</td></tr>
</tbody></table>
<h3>How to complete the Project Document</h3>
<ol>
<li><strong>Open the Project Document.</strong> Click <strong>Project Document</strong> in the sidebar. You will open directly into the <strong>General Information</strong> section — complete this first, as other sections depend on it.</li>
<li><strong>Fill in General Information.</strong> Enter the <strong>Project Title</strong> (keep it short and meaningful), select the <strong>Start Date</strong> from the calendar picker, and enter the <strong>Duration</strong> as a numeric value in months.</li>
<li><strong>Complete the Narratives.</strong> The Narratives section contains several predetermined text boxes. Hover over each title to see detailed instructions specific to that narrative. Write substantive responses and include hyperlinks to publicly accessible documents where relevant.</li>
<li><strong>Review your Indicators.</strong> The standard CRAF'd indicators are already listed for you. Delete any that do not apply to your project, and click <strong>Add</strong> to create your own custom indicators — a custom indicator requires a <strong>name</strong>, a <strong>description</strong>, and a <strong>means of verification</strong>. For each indicator, enter the <strong>Baseline Year</strong> (project start) and <strong>Baseline Value</strong>, then the <strong>Target Year</strong> (project end) and <strong>Target Value</strong>. These values are used to track progress in annual reports.</li>
<li><strong>Add risks in Risk Management.</strong> Click <strong>Add New Risk</strong> to create a risk entry. For each risk, describe the potential risk, select a category (Social and Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic), and describe the measures taken to mitigate it.</li>
<li><strong>Enter your Budgets.</strong> Enter budgets per participating organization (if applicable), disaggregated by year, in compliance with UNSDG Budget Categories. All budget totals must equal the exact amount approved for the project — the difference between the Grant Size and the Total budget must be under one dollar, or the section flags a budget adjustment.</li>
<li><strong>Fill in the Workplan grid.</strong> The Workplan is a spreadsheet-like grid automatically populated from your Results Based Management (RBM) section. Each <strong>row</strong> corresponds to an outcome, output, or activity from RBM. <strong>Columns</strong> are organized by year and subdivided into quarters (Q1–Q4). Tick the checkbox in each quarter where the corresponding outcome, output, or activity is planned to take place.</li>
<li><strong>Sign off in Signatures.</strong> Once every section is complete, open the <strong>Signatures</strong> tab and sign for your project contacts. The CRAF'd Secretariat signs its own line. See the <strong>Signatures</strong> section of this guide for the full workflow.</li>
</ol>
<p><strong>Read-only fields:</strong> Fields managed by CRAF'd (e.g. approved budgets, baselines, indicator targets) appear greyed out and cannot be edited. Contact your CRAF'd programme officer if you believe a field should be editable.</p>
$WIKI$),
('report-editor', 'Report Editor', 'FileEdit', 4, $WIKI$
<p>The <strong>Report Editor</strong> is where you submit your project's progress, usually on an annual basis. Access it via <strong>Report Editor</strong> in the sidebar — all reports available to you appear there, organized by project and year. CRAF'd may also send you a direct secure link when a new report is opened. Each report has <strong>14 sections</strong> split into Qualitative and Quantitative groups.</p>
<table><thead><tr><th>Section</th><th>Group</th><th>What to fill in</th></tr></thead><tbody>
<tr><td>Overview</td><td>Qualitative</td><td>High-level narrative summary of the project's progress and context during the reporting period.</td></tr>
<tr><td>Surveys</td><td>Qualitative</td><td>Data and findings from surveys or assessments conducted as part of the project.</td></tr>
<tr><td>Key Achievements</td><td>Qualitative</td><td>Narrative description of the project's most significant outputs and outcomes.</td></tr>
<tr><td>Partnerships</td><td>Qualitative</td><td>Description of partnerships formed and their contribution to the project's results.</td></tr>
<tr><td>Results</td><td>Qualitative</td><td>Progress against the project's stated results and objectives for the period.</td></tr>
<tr><td>Lessons Learned</td><td>Qualitative</td><td>Insights gathered during implementation that could improve future projects or inform adaptive management.</td></tr>
<tr><td>External Coverage</td><td>Qualitative</td><td>Media mentions, publications, or external recognition of the project's work.</td></tr>
<tr><td>Testimonials</td><td>Qualitative</td><td>Quotes or statements from project beneficiaries, partners, or stakeholders.</td></tr>
<tr><td>Risk Management</td><td>Quantitative</td><td>Updated risk register with current statuses and any newly identified risks since the last report.</td></tr>
<tr><td>Indicators</td><td>Quantitative</td><td>Actual values achieved for each indicator compared to baseline and targets.</td></tr>
<tr><td>Workplan</td><td>Quantitative</td><td>Quarter-grid showing planned vs. completed activities. Tick the quarters completed during this reporting period.</td></tr>
<tr><td>Expenditure</td><td>Quantitative</td><td>Actual expenditure versus approved budget, disaggregated by year and participating organization.</td></tr>
<tr><td>Transfers</td><td>Quantitative</td><td>Record of fund transfers between participating organizations or budget lines.</td></tr>
<tr><td>Complementary Funding</td><td>Quantitative</td><td>Additional funding sources that contributed to the project beyond the core CRAF'd grant.</td></tr>
</tbody></table>
<h3>How to complete and submit a Report</h3>
<ol>
<li><strong>Open your report.</strong> Click <strong>Report Editor</strong> in the sidebar. Every report available to you is listed there, grouped by project and year — click the one you want to open. If CRAF'd sent you a direct link for a newly opened report, that will take you there too.</li>
<li><strong>Navigate sections from the sidebar.</strong> Once inside a report, the sidebar shows each of its 14 sections. Sections with a <strong>green checkmark</strong> are considered complete by PRISM. The Report Editor landing page shows an overall completion progress bar.</li>
<li><strong>Complete the Qualitative sections.</strong> Work through Overview, Surveys, Key Achievements, Partnerships, Results, Lessons Learned, External Coverage, and Testimonials. Each is a rich text area — write narrative content describing your project's progress for the period. PRISM auto-saves as you type or leave a field.</li>
<li><strong>Complete the Quantitative sections.</strong> Fill in Risk Management (updated register), Indicators (actual values vs. targets), Workplan (quarter-grid ticks), Expenditure (actual vs. budget), Transfers, and Complementary Funding. These sections contain structured tables — enter figures in each row.</li>
<li><strong>Check all sections show a green checkmark.</strong> Review the sidebar to confirm every section has a green checkmark. If any are missing, open that section and complete or save the remaining required fields before returning.</li>
<li><strong>Authorize and submit.</strong> Click <strong>Authorize</strong> on the Report Editor landing page. Read and accept the authorization statement — this formally submits your report and grants CRAF'd permission to use submitted materials for outreach purposes. The report locks and enters CRAF'd's review queue.</li>
<li><strong>Respond to CRAF'd comments (if any).</strong> During review, CRAF'd may leave comments on specific sections. You will see a notification on your Home page — click it to jump directly to the relevant section. Edit the content or leave a reply, then save. When CRAF'd is satisfied, they will close the report and it becomes permanently read-only.</li>
</ol>
<p><strong>Auto-save:</strong> PRISM saves your work automatically as you type or leave a field. A 'Saved' indicator appears briefly in the top bar. In sections with an explicit Save button, click it after making changes — the button disappears once saved.</p>
<p><strong>After authorization:</strong> The report locks and all fields become read-only. Changes can only be made if CRAF'd reopens the report for revision.</p>
$WIKI$),
('report-lifecycle', 'Lifecycle & Statuses', 'Workflow', 5, $WIKI$
<p>Both the Project Document and each report move through the same three statuses. The status decides <strong>who can edit</strong> and appears as a coloured pill at the top of the editor. Knowing where you are in the lifecycle explains why a field might be editable one day and read-only the next.</p>
<table><thead><tr><th>Status</th><th>Who can edit</th><th>What it means</th></tr></thead><tbody>
<tr><td>Open</td><td>You and CRAF'd</td><td>The document is being drafted. You can edit every field that isn't managed by CRAF'd. Fill in all sections here.</td></tr>
<tr><td>Under Review</td><td>CRAF'd only</td><td>You have authorized/submitted, and CRAF'd is reviewing. The document becomes read-only for you while reviewers check it and may leave comments.</td></tr>
<tr><td>Closed</td><td>No one</td><td>The document is finalized and permanently read-only for everyone. Reopening requires CRAF'd to change the status back.</td></tr>
</tbody></table>
<h3>The typical journey</h3>
<ol>
<li><strong>Draft (Open).</strong> You complete every section. PRISM auto-saves as you go and shows a green checkmark for each finished section.</li>
<li><strong>Authorize.</strong> For a report, you click <strong>Authorize</strong> and accept the authorization statement to submit. This formally hands the report to CRAF'd and locks it for you.</li>
<li><strong>Under Review.</strong> CRAF'd checks your submission and may leave comments on specific sections. If changes are needed, they reopen the document so you can respond.</li>
<li><strong>Closed.</strong> Once CRAF'd is satisfied, the document is closed and becomes a permanent, read-only record.</li>
</ol>
<p><strong>Why is this field greyed out?</strong> Most often the document is <strong>Under Review</strong> or <strong>Closed</strong>, so editing is locked. Other fields (approved budgets, baselines, indicator targets, or figures from a previous year) are managed by CRAF'd and stay read-only at all times. Contact your programme officer if you believe something should be editable.</p>
$WIKI$),
('signatures', 'Signatures & Sign-off', 'PenLine', 6, $WIKI$
<p>The Project Document is finalized by a formal sign-off. The <strong>Signatures</strong> tab in the Project Document editor lists your <strong>project contacts</strong> alongside the <strong>CRAF'd Secretariat</strong>. Signing is what turns a completed ProDoc into an agreement that can initiate funding disbursement.</p>
<ul>
<li><strong>Your project contacts.</strong> You (the partner) sign on behalf of each project contact. The contacts shown here come from the General Information / Contact Information you have entered — add or update them there first.</li>
<li><strong>CRAF'd Secretariat.</strong> Only CRAF'd can sign the Secretariat line. Until they do, it shows "Awaiting signature" — you cannot sign it on their behalf, and they cannot sign for your contacts.</li>
</ul>
<h3>How to sign</h3>
<ol>
<li><strong>Make sure your contacts are correct.</strong> Signatures are generated from your project contacts. Add each person who needs to sign in the <strong>Contact Information</strong> section (or the ProDoc's General Information) before you open the Signatures tab.</li>
<li><strong>Open the Signatures tab.</strong> In the <strong>Project Document</strong>, choose <strong>Signatures</strong> from the section dropdown. Each contact appears as a row with a <strong>Sign</strong> button.</li>
<li><strong>Sign for each contact.</strong> Click <strong>Sign</strong> on a contact's row. PRISM stamps the signature with the date, and the row turns into a green <strong>Signed</strong> badge. Repeat for every project contact.</li>
<li><strong>CRAF'd signs the Secretariat line.</strong> Once your side is complete, the CRAF'd Secretariat signs its own line. When all parties have signed, the Project Document is fully executed.</li>
<li><strong>See the signatures on the export.</strong> Signed names and dates appear in the <strong>Signatures</strong> section of the exported/printed Project Document — see <strong>Exporting &amp; Printing</strong> below.</li>
</ol>
<p><strong>Signed in error?</strong> You can remove a signature you made by clicking the small remove control next to the Signed badge and confirming. This only applies to your own contact signatures.</p>
<p><strong>Who signs what:</strong> The partner signs only for project contacts; the CRAF'd Secretariat line is signed only by CRAF'd. Neither side can sign or remove the other's signatures.</p>
$WIKI$),
('comments', 'Comments & Feedback', 'MessageSquare', 7, $WIKI$
<p>Review is a conversation. When CRAF'd looks over your Project Document or a report, reviewers can attach <strong>comments</strong> to specific sections — asking a question, requesting a clarification, or pointing out something that needs a change. This section explains how to find and respond to them.</p>
<ol>
<li><strong>Spot the notification.</strong> New comments surface on your <strong>Home</strong> page. Each entry tells you which project, report, and section the comment is on.</li>
<li><strong>Jump to the section.</strong> Click the comment to open the exact section it refers to, so you can see it in context next to the content being discussed.</li>
<li><strong>Respond or edit.</strong> Read the comment, then either <strong>reply</strong> to answer the reviewer or <strong>edit the content</strong> to address the request — often both. Your edits auto-save as you make them.</li>
<li><strong>Let the review continue.</strong> CRAF'd sees your replies and updated content. They may follow up with more comments or, once satisfied, close the document. A closed document becomes permanently read-only.</li>
</ol>
<p><strong>Tip:</strong> Keep replies concise and specific — reference the change you made ("Updated the baseline figure to 2024 data") so reviewers can confirm quickly. This shortens the review cycle.</p>
$WIKI$),
('contacts', 'Contact Information', 'Contact', 8, $WIKI$
<p>The <strong>Contact Information</strong> section is where you keep your organization's people up to date. These contacts are more than an address book — they populate the project contacts on your Project Document and drive the <strong>Signatures</strong> sign-off, so keeping them accurate matters.</p>
<ul>
<li><strong>Focal Point.</strong> CRAF'd's main point of contact for the project — typically the person accountable for reporting and communication.</li>
<li><strong>Project Manager.</strong> The person running day-to-day delivery of the project.</li>
</ul>
<ol>
<li><strong>Open Contact Information.</strong> Click <strong>Contact Information</strong> in the sidebar to see your organization's current contacts.</li>
<li><strong>Add or edit a person.</strong> Add each person with their <strong>name</strong>, <strong>role/title</strong>, and <strong>email</strong>. Assign a relationship — <strong>Focal Point</strong> or <strong>Project Manager</strong> — where relevant.</li>
<li><strong>Keep it current.</strong> Update contacts whenever someone joins or leaves. Because these feed the ProDoc and the signature lines, an out-of-date list can hold up sign-off.</li>
</ol>
<p>Contacts you add here appear as the <strong>project contacts</strong> on the Project Document and in the Signatures tab. Add everyone who needs to sign <em>before</em> you begin the sign-off.</p>
$WIKI$),
('exporting', 'Exporting & Printing', 'Printer', 9, $WIKI$
<p>You can produce a clean PDF of your Project Document at any time — handy for internal review, sharing with colleagues, or keeping a signed record on file. PRISM renders a properly typeset A4 document with your organization's logo, the full content of every section, and the signatures block.</p>
<ol>
<li><strong>Open the Project Document.</strong> Go to <strong>Project Document</strong> and make sure the document you want is selected in the dropdown at the top.</li>
<li><strong>Click Print.</strong> Click the <strong>Print</strong> button next to the dropdown. A print-ready view of the document opens in a new tab.</li>
<li><strong>Save as PDF.</strong> Your browser's print dialog appears. Choose <strong>Save as PDF</strong> as the destination (rather than a physical printer) and save the file. The dialog may open automatically.</li>
</ol>
<p><strong>Real, searchable text:</strong> The PDF uses actual document fonts, so the text stays selectable and searchable — not a flat image. SDG target icons and any signatures are included in the output.</p>
<p><strong>Sign first for a complete record.</strong> If you export before signing, the signature lines print blank. Complete the <strong>Signatures</strong> tab first if you want the signed names and dates to appear.</p>
$WIKI$),
('key-features', 'Key Features', 'Sparkles', 10, $WIKI$
<table><thead><tr><th>Feature</th><th>Category</th><th>What it does</th></tr></thead><tbody>
<tr><td>Report Editor</td><td>Core</td><td>Complete all 14 sections of your annual or final report in one place. Sections are grouped into Qualitative and Quantitative, with guidance throughout.</td></tr>
<tr><td>Project Document</td><td>Core</td><td>Manage your project's core reference document — general information, narratives, risk register, indicators, workplan, and budget.</td></tr>
<tr><td>Auto-save</td><td>Convenience</td><td>All changes save automatically as you type or leave a field. A brief 'Saved' indicator confirms each write. No manual saving needed.</td></tr>
<tr><td>Feedback &amp; Comments</td><td>Collaboration</td><td>CRAF'd reviewers leave comments on specific sections. These appear on your Home page and link directly to the relevant section.</td></tr>
<tr><td>Completion Tracking</td><td>Progress</td><td>Green checkmarks in the sidebar show which sections are done. A progress bar on the Report Editor landing page shows overall completion.</td></tr>
<tr><td>Authorization</td><td>Submission</td><td>Formally submit your report by accepting the authorization statement. The report locks and enters CRAF'd's review queue.</td></tr>
<tr><td>Timeline</td><td>Planning</td><td>Your Home page shows project start/end dates and report deadlines on a visual timeline, with a pulsing marker for today.</td></tr>
<tr><td>Contact Information</td><td>Admin</td><td>Manage your organization's team contacts, roles, and email addresses through the Contact Information section.</td></tr>
</tbody></table>
$WIKI$),
('glossary', 'Glossary', 'Library', 11, $WIKI$
<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody>
<tr><td>PRISM</td><td>The CRAF'd reporting platform you are using — where Project Documents and reports are created, submitted, and reviewed.</td></tr>
<tr><td>Project Document (ProDoc)</td><td>Your project's core reference document: general information, narratives, indicators, risks, budgets, workplan, and signatures. Must be completed before funding is disbursed.</td></tr>
<tr><td>Report</td><td>A periodic (usually annual, and a final) submission of your project's progress, organized into 14 qualitative and quantitative sections.</td></tr>
<tr><td>RBM (Results Based Management)</td><td>The framework of outcomes, outputs, and activities your project is built around. The Workplan is generated from it.</td></tr>
<tr><td>Outcome / Output / Activity</td><td>The RBM hierarchy: outcomes are the high-level changes sought, outputs are the deliverables that lead to them, and activities are the concrete tasks that produce outputs.</td></tr>
<tr><td>Indicator</td><td>A measurable value used to track progress. Each has a baseline (starting point) and a target (goal), with a year for each.</td></tr>
<tr><td>Baseline / Target</td><td>The indicator's value at the start of the project (baseline) and the value it aims to reach by the end (target).</td></tr>
<tr><td>SDG Targets</td><td>The specific UN Sustainable Development Goal targets your project contributes to. Each is assigned a focus percentage; together they should total 100%.</td></tr>
<tr><td>UNSDG Budget Categories</td><td>The standard budget-line categories all expenditure must be reported against.</td></tr>
<tr><td>Indirect (support) costs</td><td>The percentage added on top of direct project costs to cover overheads. Applied automatically in the budget totals.</td></tr>
<tr><td>Transfers</td><td>Movements of funds between participating organizations or budget lines, recorded in the report.</td></tr>
<tr><td>Complementary Funding</td><td>Additional funding sources that contributed to the project beyond the core CRAF'd grant.</td></tr>
<tr><td>Focal Point</td><td>The primary contact CRAF'd communicates with for the project, usually accountable for reporting.</td></tr>
<tr><td>Authorize</td><td>The action that formally submits a report to CRAF'd. It locks the report for you and grants CRAF'd permission to use submitted materials for outreach.</td></tr>
<tr><td>Secure link</td><td>A personal email link CRAF'd can send that opens a specific report directly, without a separate login.</td></tr>
<tr><td>Auto-save</td><td>PRISM's automatic saving — changes are written as you type or leave a field, confirmed by a brief 'Saved' indicator.</td></tr>
</tbody></table>
$WIKI$),
('faq', 'FAQ', 'HelpCircle', 12, $WIKI$
<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>
<tr><td>I cannot log in — what should I do?</td><td>Check that you are using the correct username and password provided by CRAF'd. Passwords are case-sensitive. If you have forgotten your password, contact your CRAF'd programme officer to request a reset.</td></tr>
<tr><td>I manage more than one project — how do I switch between them?</td><td>In the Report Editor section of the sidebar, each project and year appears as a separate entry. Click on the one you want to open.</td></tr>
<tr><td>A field is greyed out and I cannot edit it — why?</td><td>Fields become read-only after a report has been authorized, when the field is managed by CRAF'd (e.g. approved budgets, baselines, indicator targets), or when it belongs to a previous year in multi-year tables. Contact CRAF'd if you believe a field should be editable.</td></tr>
<tr><td>How do I know my data has been saved?</td><td>PRISM saves automatically. A 'Saved' indicator appears briefly in the top bar when a change is written. In sections with a Save button, click it after making changes — the button disappears once saved.</td></tr>
<tr><td>Who do I contact for help?</td><td>For questions about report content or deadlines, contact your CRAF'd programme officer. For technical issues with PRISM, contact the CRAF'd data team — include a screenshot and description of the problem.</td></tr>
</tbody></table>
$WIKI$)
ON CONFLICT (slug) DO NOTHING;
