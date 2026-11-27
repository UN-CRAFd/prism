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
        'prodoc',
        'update'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Note: the reports table no longer uses data_type_enum; it uses TEXT with a CHECK constraint instead.

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
    -- NULL until the partner sets a password on first use of a share link;
    -- password_set_at tracks whether setup has happened.
    password_hash        TEXT,                            -- scrypt:<salt>:<hash>
    mail_account         TEXT         UNIQUE,             -- optional; login also works by short_name (NULLs allowed, not unique-constrained)
    password_set_at      TIMESTAMPTZ,                     -- when the partner set their own password via a share link (NULL = not yet)
    session_version      INTEGER      NOT NULL DEFAULT 0, -- bumped on password change/reset: logs out every earlier login (db/add-session-versions.sql)
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

-- ── Partner contacts (people at a partner org: name, job title, email) ───────
CREATE TABLE IF NOT EXISTS partner_contacts (
    id         SERIAL       PRIMARY KEY,
    partner_id INTEGER      NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    organization VARCHAR(200),
    job_title    TEXT,
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
    status_manual           BOOLEAN        NOT NULL DEFAULT false,  -- true = status picked by an admin; automatic rules skip it
    mptfo_project_number    TEXT,
    grant_size_usd          NUMERIC(15,2),
    project_start_date      DATE,
    project_duration_months INTEGER,
    geographic_scope        TEXT,
    keyword                      TEXT,
    universal_markers       TEXT,
    optional_markers        TEXT,
    fund_specific_markers   TEXT,
    allocation_modality     TEXT,          -- admin-only (options: allocationModality)
    investment_type         TEXT,          -- admin-only (options: investmentType)
    investment_theme        TEXT,          -- admin-only (options: investmentTheme; admins add/delete inline)
    gender_equality_marker  TEXT,          -- GEM0..GEM3 (options: genderEqualityMarker)
    indirect_cost_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.07,
    archived                BOOLEAN       NOT NULL DEFAULT FALSE,  -- hidden from the admin Projects overview by default (Active/Archived filter)
    no_documents_confirmed  BOOLEAN       NOT NULL DEFAULT FALSE,  -- partner ticked "No documents to upload" (Documents tab complete without uploads)
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
-- Links a project to its partner-org contacts, with one or more pipe-delimited
-- roles. Valid values: Primary focal point | Alternate focal point | Signatory
-- | Applicant. Applicant replaces the former is_applicant boolean. One row per
-- pair.
CREATE TABLE IF NOT EXISTS project_contacts (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contact_id   INTEGER      NOT NULL REFERENCES partner_contacts(id) ON DELETE CASCADE,
    roles        TEXT,
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

-- ── Project tranche cells (tranche matrix: one cell per org × tranche) ──────
-- Replaces the flat project_tranches rows with a matrix whose row dimension is
-- project_organizations and whose column dimension is a 1-based tranche_number.
-- The UNIQUE constraint on (project_id, organization_id, tranche_number) ensures
-- exactly one cell per position. Cascade-deleted with the project or the org row.
CREATE TABLE IF NOT EXISTS project_tranche_cells (
    id               SERIAL        PRIMARY KEY,
    project_id       INTEGER       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id  INTEGER       NOT NULL
                         REFERENCES project_organizations(id) ON DELETE CASCADE,
    tranche_number   INTEGER       NOT NULL CHECK (tranche_number >= 1),
    amount           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    date_description TEXT,
    release_date     DATE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (project_id, organization_id, tranche_number)
);
CREATE INDEX IF NOT EXISTS project_tranche_cells_project_id_idx
    ON project_tranche_cells(project_id);
DROP TRIGGER IF EXISTS project_tranche_cells_updated_at ON project_tranche_cells;
CREATE TRIGGER project_tranche_cells_updated_at
    BEFORE UPDATE ON project_tranche_cells
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id                     SERIAL         PRIMARY KEY,
    project_id             INTEGER        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    year                   SMALLINT       NOT NULL CHECK (year BETWEEN 2020 AND 2050),
    report_submission_date DATE,
    authorized             BOOLEAN        NOT NULL DEFAULT FALSE,
    submitted_at           TIMESTAMPTZ,                            -- when the partner formally submitted
    status                 TEXT           NOT NULL DEFAULT 'Open',
    data_type              TEXT           NOT NULL DEFAULT 'report',
    report_type            TEXT,
    mptfo_report_link      TEXT,
    risk_shared_years      INTEGER[]      NOT NULL DEFAULT '{}',
    unlocked_sections      TEXT[]         NOT NULL DEFAULT '{}',  -- tabs an admin has unlocked: workplan, risk, expenditure (derived from update_modules)
    update_types           TEXT[]         NOT NULL DEFAULT '{}',  -- project update: categories covered (budget_revision, tranche_release, …)
    update_modules         TEXT[]         NOT NULL DEFAULT '{}',  -- project update: modules included (justification, workplan_months, expenditure_budget, …)
    update_months          INTEGER,                               -- project update: length of the extension, when an "+ extended time frame" module is included
    update_index           TEXT           NOT NULL DEFAULT '',    -- project update: free-text tag telling apart several updates in one year ("Project Update 2027 (2)"); always '' for reports and prodocs
    archived               BOOLEAN        NOT NULL DEFAULT FALSE,  -- hidden from the admin Reports / Project Updates overviews by default
    indirect_expenditure   NUMERIC(15,2)  CHECK (indirect_expenditure IS NULL OR indirect_expenditure >= 0),
                                                                  -- project update: indirect support costs actually spent in the year this document reports. One figure per document, so it sits here rather than in expenditure_entries (which is keyed by budget category, and ISC is not one). See db/add-expenditure-indirect.sql.
    no_transfers_confirmed     BOOLEAN    NOT NULL DEFAULT FALSE,  -- partner ticked "No transfers to report" (Transfers section complete with zero rows); cleared when a row is added. See db/add-no-transfers-complementary-confirmed.sql.
    no_complementary_confirmed BOOLEAN    NOT NULL DEFAULT FALSE,  -- partner ticked "No complementary funding to report" (Complementary section complete with zero rows); cleared when a row is added.
    no_partnerships_confirmed  BOOLEAN    NOT NULL DEFAULT FALSE,  -- partner ticked "No partnerships to report" (Partnerships section complete with zero rows); cleared when a row is added. See db/add-no-partnerships-confirmed.sql.
    created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    -- update_index is '' for reports and prodocs, so they stay one per
    -- project/year/type; project updates use it to allow several in one year.
    UNIQUE (project_id, year, data_type, update_index),
    CONSTRAINT reports_data_type_check CHECK (data_type = ANY (ARRAY['report', 'prodoc', 'update']))
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


-- ── Version log (status-change history) ──────────────────────────────────────
-- One row per status transition on a report, prodoc or project. Append-only:
-- prism_app is granted INSERT and SELECT only (see roles.sql), so entries can
-- never be edited or removed by the application. Partner submissions record the
-- org; CRAF'd status moves additionally record a typed name and free-text
-- reason. `snapshot` is reserved for a frozen copy of what was submitted.
CREATE TABLE IF NOT EXISTS version_log (
    id            SERIAL       PRIMARY KEY,
    entity_type   TEXT         NOT NULL,
    entity_id     INTEGER      NOT NULL,
    entity_label  TEXT,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_status   TEXT,
    to_status     TEXT         NOT NULL,
    actor_role    TEXT         NOT NULL,
    actor_org     TEXT,
    actor_name    TEXT,
    reason        TEXT,
    snapshot      JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS version_log_project_id_idx ON version_log(project_id);
CREATE INDEX IF NOT EXISTS version_log_entity_idx ON version_log(entity_type, entity_id);

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
    author      TEXT,
    author_role TEXT,                              -- 'admin' | 'partner', set server-side
    item_label  TEXT,
    parent_id   INTEGER REFERENCES item_comments(id) ON DELETE CASCADE,  -- NULL = top-level
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT item_comments_author_role_check
        CHECK (author_role IS NULL OR author_role IN ('admin', 'partner'))
);

CREATE INDEX IF NOT EXISTS item_comments_lookup_idx ON item_comments (report_id, section, item_id);
CREATE INDEX IF NOT EXISTS item_comments_parent_idx ON item_comments (parent_id);
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
    cycle                 TEXT                    DEFAULT 'at_closure' CHECK (cycle IN ('yearly', 'at_closure')),
    -- Defaults to custom: an indicator only joins the CRAF'd standard library
    -- when a caller says so outright (the seed below, and the admin library
    -- page). Partner-created indicators come in through the report and
    -- project-document editors, so a TRUE default filed them under "CRAF'd
    -- standard indicators" whenever the flag was left off.
    is_standard           BOOLEAN                 NOT NULL DEFAULT FALSE,
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
    linked_activity_id INTEGER      REFERENCES workplan_activities(id) ON DELETE SET NULL, -- workplan activity this indicator supports
    linked_results        TEXT[]       NOT NULL DEFAULT '{}',
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
    risk_description    TEXT,
    likelihood          SMALLINT     CHECK (likelihood BETWEEN 1 AND 5),
    impact              SMALLINT     CHECK (impact BETWEEN 1 AND 5),
    updated_likelihood  SMALLINT     CHECK (updated_likelihood BETWEEN 1 AND 5),
    updated_impact      SMALLINT     CHECK (updated_impact BETWEEN 1 AND 5),
    approved_mitigation TEXT,
    updated_mitigation  TEXT,
    project_revision    BOOLEAN      NOT NULL DEFAULT FALSE,
    risk_status         TEXT         CHECK (risk_status IN ('unchanged', 'changed', 'happened')),  -- carried-over risks only: what happened since the last report (see db/021_risk_status.sql)
    source_risk_id      INTEGER      REFERENCES risk_management(id) ON DELETE SET NULL,
    origin_risk_id      INTEGER,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_management_report_id_idx ON risk_management(report_id);
CREATE INDEX IF NOT EXISTS risk_management_origin_idx ON risk_management(origin_risk_id);

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

CREATE OR REPLACE FUNCTION risk_set_origin() RETURNS trigger AS $$
BEGIN
  IF NEW.origin_risk_id IS NULL THEN
    IF NEW.source_risk_id IS NOT NULL THEN
      SELECT origin_risk_id INTO NEW.origin_risk_id
        FROM risk_management WHERE id = NEW.source_risk_id;
    END IF;
    NEW.origin_risk_id := COALESCE(NEW.origin_risk_id, NEW.source_risk_id, NEW.id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_management_set_origin ON risk_management;
CREATE TRIGGER risk_management_set_origin
  BEFORE INSERT ON risk_management
  FOR EACH ROW EXECUTE FUNCTION risk_set_origin();

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
-- user quotes (kind='partner') + up to five "Photos from the Ground" (kind='ground';
-- quote holds the description & caption, photos (each with caption + credits) in
-- testimonial_photos)
-- per report. Per-kind caps enforced in the API.
CREATE TABLE IF NOT EXISTS testimonials (
    id            SERIAL       PRIMARY KEY,
    report_id     INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    kind          TEXT         NOT NULL CONSTRAINT testimonials_kind_check CHECK (kind IN ('leadership', 'partner', 'ground')),
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

CREATE TABLE IF NOT EXISTS testimonial_photos (
    id                SERIAL       PRIMARY KEY,
    testimonial_id    INTEGER      NOT NULL REFERENCES testimonials(id) ON DELETE CASCADE,
    photo_link        TEXT,
    photo_content     BYTEA,
    photo_mime_type   TEXT,
    photo_file_name   TEXT,
    photo_size_bytes  INTEGER,
    photo_label       TEXT,
    photo_credits     TEXT,
    sort_order        INTEGER      NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS testimonial_photos_testimonial_idx ON testimonial_photos(testimonial_id);

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

-- One description per (project, category) — the admin's summary of what this
-- budget category covers across all years (e.g. "Field visits, workshops and
-- training materials for all project years"). Shown as a column in the budget
-- table on the ProDoc editor and print view.
CREATE TABLE IF NOT EXISTS expenditure_budget_category_notes (
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    description  TEXT,
    PRIMARY KEY (project_id, category_id)
);

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
    -- Project updates carrying a budget revision: the partner's proposed new
    -- budget for this category over the whole project period. NULL on an annual
    -- report, which has no budget to propose. See db/add-expenditure-proposed.sql.
    proposed_amount    NUMERIC(15,2) CHECK (proposed_amount IS NULL OR proposed_amount >= 0),
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

-- Budget revisions: the budget a partner plans to spend per category in each
-- remaining project year (and in years a no cost extension adds). The new
-- requested total = spent so far + planned; it is also written back to
-- expenditure_entries.proposed_amount. category_id NULL = the planned indirect
-- support costs for that year. See db/add-expenditure-forecasts.sql.
CREATE TABLE IF NOT EXISTS expenditure_forecasts (
    id              SERIAL        PRIMARY KEY,
    report_id       INTEGER       NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category_id     INTEGER       REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    year            SMALLINT      NOT NULL CHECK (year BETWEEN 2020 AND 2060),
    planned_amount  NUMERIC(15,2) CHECK (planned_amount IS NULL OR planned_amount >= 0),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS expenditure_forecasts_category_uq
    ON expenditure_forecasts(report_id, category_id, year) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenditure_forecasts_isc_uq
    ON expenditure_forecasts(report_id, year) WHERE category_id IS NULL;
DROP TRIGGER IF EXISTS expenditure_forecasts_updated_at ON expenditure_forecasts;
CREATE TRIGGER expenditure_forecasts_updated_at
    BEFORE UPDATE ON expenditure_forecasts
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── HACT recommendations (per project) ──────────────────────────────────────
-- One running list per project, maintained by CRAF'd on /admin/hact-recommendations
-- and shown on the HACT page of every project update. The partner writes only
-- partner_comment (enforced in /api/hact-recommendations). "No." is the row's
-- position; `number` is unused. report_id records the update a row was first
-- entered on (legacy, unused). See db/add-hact-recommendations.sql and
-- db/hact-recommendations-project-scope.sql.
CREATE TABLE IF NOT EXISTS hact_recommendations (
    id              SERIAL       PRIMARY KEY,
    project_id      INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_id       INTEGER      REFERENCES reports(id) ON DELETE CASCADE,
    number          TEXT         NOT NULL DEFAULT '',
    finding         TEXT         NOT NULL DEFAULT '',
    recommendation  TEXT         NOT NULL DEFAULT '',
    addressed_by    TEXT         NOT NULL DEFAULT '',
    partner_comment TEXT         NOT NULL DEFAULT '',
    status          TEXT,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hact_recommendations_project_idx ON hact_recommendations(project_id);
CREATE INDEX IF NOT EXISTS hact_recommendations_report_idx ON hact_recommendations(report_id);
DROP TRIGGER IF EXISTS hact_recommendations_updated_at ON hact_recommendations;
CREATE TRIGGER hact_recommendations_updated_at
    BEFORE UPDATE ON hact_recommendations
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

-- A transfer can support several workplan activities (many-to-many), like
-- complementary_data_activities. ON DELETE CASCADE drops the link when either the
-- transfer or the activity is removed. (018)
CREATE TABLE IF NOT EXISTS transfer_data_activities (
    transfer_data_id INTEGER NOT NULL REFERENCES transfer_data(id)        ON DELETE CASCADE,
    activity_id      INTEGER NOT NULL REFERENCES workplan_activities(id)  ON DELETE CASCADE,
    PRIMARY KEY (transfer_data_id, activity_id)
);
CREATE INDEX IF NOT EXISTS transfer_data_activities_activity_idx
    ON transfer_data_activities(activity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON transfer_data_activities TO prism_app;

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

-- ── Standalone prodoc signatories ───────────────────────────────────────────
-- People who sign the project document without being project contacts (e.g. an
-- OIC standing in, an emergency no-cost-extension substitute). Deliberately NOT
-- written to partner_contacts — Niroj's explicit requirement. Managed from the
-- Signatures tab; rendered in the exported prodoc with a blank signature space.
-- All fields including signee_name are nullable — a fully blank signatory is
-- valid and acts as a placeholder to be filled on the printed document.
CREATE TABLE IF NOT EXISTS prodoc_signatories (
    id           SERIAL       PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT,
    signee_name  TEXT,                          -- nullable since migration 026
    organization TEXT,
    email        TEXT,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prodoc_signatories_project_idx ON prodoc_signatories(project_id);
DROP TRIGGER IF EXISTS prodoc_signatories_updated_at ON prodoc_signatories;
CREATE TRIGGER prodoc_signatories_updated_at
    BEFORE UPDATE ON prodoc_signatories
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- ── Prodoc editor lock (one lock per project; heartbeat maintains last_seen_at) ──
-- Enforces single-editor access at the DB level. session_id distinguishes
-- concurrent browser sessions from the same login. No updated_at trigger —
-- last_seen_at is maintained explicitly by the heartbeat route.
CREATE TABLE IF NOT EXISTS prodoc_editor_locks (
    project_id    INTEGER      PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    session_id    TEXT         NOT NULL,
    holder_name   TEXT         NOT NULL,
    holder_role   TEXT         NOT NULL,
    acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_editor_locks (
    report_id     INTEGER      PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
    session_id    TEXT         NOT NULL,
    holder_name   TEXT         NOT NULL,
    holder_role   TEXT         NOT NULL,
    acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

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
    doc_name    TEXT,
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

-- ── Wiki images ──────────────────────────────────────────────────────────────
-- Screenshots/images embedded in wiki section bodies. Stored as BYTEA and
-- served from /api/wiki-images/<id>. Created by admins; readable by any logged-in
-- user (partners see images in the wiki). Images are immutable once uploaded.
CREATE TABLE IF NOT EXISTS wiki_images (
    id          SERIAL       PRIMARY KEY,
    content     BYTEA        NOT NULL,
    mime_type   TEXT         NOT NULL,
    file_name   TEXT,
    size_bytes  INTEGER      NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, DELETE ON TABLE wiki_images TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE wiki_images_id_seq TO prism_app;

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

-- Login protection: failed-attempt counters and lockouts per key
-- ('login:partner:<id>', 'login:name:<username>', 'login:admin'). 5 failures lock
-- a partner until a new password is issued, the admin account for 15 minutes.
-- See db/add-login-attempts.sql and src/lib/login-throttle.ts.
CREATE TABLE IF NOT EXISTS login_attempts (
    key             TEXT         PRIMARY KEY,
    failures        INTEGER      NOT NULL DEFAULT 0,
    last_failed_at  TIMESTAMPTZ,
    locked_until    TIMESTAMPTZ
);

-- Monthly package & security check results (scripts/security-check.mjs), shown
-- on the admin Security page. See db/add-security-checks.sql.
CREATE TABLE IF NOT EXISTS security_checks (
    id       SERIAL       PRIMARY KEY,
    run_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    source   TEXT         NOT NULL DEFAULT 'script',
    status   TEXT         NOT NULL CHECK (status IN ('ok', 'attention', 'action')),
    report   JSONB        NOT NULL
);
CREATE INDEX IF NOT EXISTS security_checks_run_at_idx ON security_checks (run_at DESC);

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
     'Investment', 'at_closure'),
    ('Funding allocated for crisis action specifically in fragile settings',
     'This sub-indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action specifically in fragile contexts.',
     'Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.',
     'Investment', 'at_closure'),
    ('Project partners involved in the implementation of the project',
     'This indicator aims to measure the number of project partners involved in the implementation of the project.',
     'Internal tracking.',
     'Capacity', 'at_closure'),
    ('Project partners from fragile and/or crisis-affected settings',
     'This sub-indicator aims to measure the number of project partners specifically from fragile and/or crisis affected settings.',
     'Internal tracking.',
     'Capacity', 'at_closure'),
    ('Datasets provided by the project',
     'This indicator aims to measure the provision and dissemination of datasets by the project to stakeholders.',
     'Internal tracking.',
     'Capacity', 'at_closure')
  ) AS v(name, description, means_of_verification, category, cycle)
 WHERE NOT EXISTS (SELECT 1 FROM indicators WHERE is_standard);

-- Wiki / Guide sections: the partner Guide as rewritten in db/guide-2026-11.md
-- (Nov 27, 2026). Bodies are dollar-quoted ($WIKI$) so the embedded HTML/quotes
-- need no escaping. Idempotent via ON CONFLICT (slug). Supersedes the original seed
-- in db/archive/migrations/051_wiki_sections.sql, which is no longer identical.
INSERT INTO wiki_sections (slug, title, icon, sort_order, body_html) VALUES
('introduction', 'Introduction', 'BookOpen', 1, $WIKI$
<p>PRISM is the CRAF'd platform for your project documents, reports and project updates. You fill them in online, submit them to the CRAF'd Secretariat, and answer CRAF'd's comments in the same place.</p>
<p>In PRISM you:</p>
<ul><li><strong>Complete your Project Document (ProDoc).</strong> It describes your project, its work plan, indicators, risks and budget. It must be approved before funds are released.</li><li><strong>Submit Project Reports.</strong> An Annual Report for each year and a Final Report at the end of the project.</li><li><strong>Submit Project Updates.</strong> When CRAF'd opens one for you, for example for a budget revision, a no-cost extension or a tranche release.</li><li><strong>Answer comments.</strong> CRAF'd may comment on parts of your documents. You reply and update your text.</li></ul>
<p>For questions about content or deadlines, contact the CRAF'd Secretariat at crafd@un.org.</p>
$WIKI$),
('getting-started', 'Getting started', 'LogIn', 2, $WIKI$
<p>PRISM runs in your browser (Chrome, Edge, Firefox or Safari); there is nothing to install. Your organization has one shared login.</p>
<h3>Logging in</h3>
<ol><li><strong>First time.</strong> CRAF'd sends your organization a secure link by email. Open it and set a password. The link is valid for 7 days.</li><li><strong>After that.</strong> Go to the PRISM login page and sign in with your organization's username (or email) and password.</li><li><strong>Password rules.</strong> At least 8 characters, with an uppercase letter, a number and a special character.</li><li><strong>Locked out.</strong> After 5 wrong attempts the account is locked. Contact crafd@un.org to have it unlocked or reset. "Forgot password" does not send an email.</li></ol>
<p>If someone sets a new password, everyone else using the login is signed out.</p>
<h3>Staying signed in</h3>
<p>After 15 minutes without activity, PRISM signs you out. One minute before, a message appears: click <strong>Stay signed in</strong> to continue. Your work is saved as you go, so nothing is lost.</p>
<h3>The sidebar</h3>
<table><thead><tr><th>Item</th><th>What it's for</th></tr></thead><tbody><tr><td>Home</td><td>Your projects, timeline and next steps</td></tr><tr><td>Project Document</td><td>Your project documents and their tabs</td></tr><tr><td>Project Report</td><td>Your Annual and Final Reports</td></tr><tr><td>Project Update</td><td>Project updates CRAF'd has opened for you</td></tr><tr><td>Project Contacts</td><td>Your organization's contacts</td></tr><tr><td>Guide</td><td>This guide</td></tr></tbody></table>
<p>Project Document, Project Report and Project Update only appear when you have one. Inside a document, its tabs are listed in the sidebar.</p>
<p>To get more space, click the panel icon at the top of the sidebar to collapse it, and the same icon to open it again. Your organization's name and the sign-out button are at the bottom.</p>
$WIKI$),
('home', 'Home', 'Home', 3, $WIKI$
<p>Home shows what needs your attention.</p>
<p>Each project has its own box. Click the box header to open or close it. A project with an overdue item is marked <strong>Overdue</strong> in red. Projects that have ended with nothing left to do move to <strong>Past projects</strong> at the bottom.</p>
<h3>In each project box</h3>
<ul><li><strong>Requested / Grant.</strong> The funding amount. It says "Requested" until your Project Document is approved, then "Grant".</li><li><strong>Period.</strong> Start and end dates, and the number of months.</li><li><strong>Open comments.</strong> CRAF'd comments still waiting for your reply.</li><li><strong>Next deadline.</strong> In dark yellow when it is within 14 days, in red when it has passed.</li></ul>
<h3>The timeline</h3>
<p>The timeline shows your Project Document, reports and updates in date order, then the project end, the Final Report and closure.</p>
<table><thead><tr><th>Dot</th><th>Meaning</th></tr></thead><tbody><tr><td>Green ✓</td><td>Approved, or the date has passed</td></tr><tr><td>Grey clock</td><td>With CRAF'd for review</td></tr><tr><td>Yellow</td><td>In progress; the due date shows below</td></tr><tr><td>Empty circle</td><td>Not started yet</td></tr></tbody></table>
<h3>Your next steps</h3>
<p>The list under the timeline tells you what to do next. Your Project Document comes first, then overdue items, then the rest by due date.</p>
<ul><li><strong>Continue</strong> opens a document you are completing.</li><li><strong>Revise</strong> opens a document CRAF'd has sent back to you.</li><li>Documents with CRAF'd are listed as "With CRAF'd for review". There is nothing for you to do on them.</li><li>When nothing is waiting for you, the list says "Nothing to do right now."</li></ul>
$WIKI$),
('project-document', 'Project Document', 'FileText', 4, $WIKI$
<p>The Project Document (ProDoc) is your project's core document. CRAF'd must approve it before funds are released. It has seven tabs, listed in the sidebar. A tab gets a green tick when it is complete.</p>
<table><thead><tr><th>Tab</th><th>What you fill in</th><th>Needed for the tick</th></tr></thead><tbody><tr><td>General Information</td><td>Project name, requested funding (USD), start date, duration in months, geographic scope, description (max. 500 words), Gender Equality Marker, project partners, implementing organizations, contacts</td><td>All fields except partners, organizations and contacts</td></tr><tr><td>Narratives</td><td>One answer per question</td><td>Every answer, max. 500 words each</td></tr><tr><td>Work Plan</td><td>Outcomes, outputs under each outcome, activities under each output, and the quarters each activity takes place</td><td>At least one activity, with its outcome and output</td></tr><tr><td>Indicators</td><td>Baseline and target for each indicator, and the outcomes or outputs it measures</td><td>A baseline, a target and a link for every indicator; every outcome and output has at least one indicator</td></tr><tr><td>Risk Management</td><td>Risks to the project</td><td>Each risk has a description, likelihood and impact</td></tr><tr><td>Budget</td><td>Annual budget per category, a description per category, and the tranche release schedule</td><td>Budget and tranche totals match the requested funding</td></tr><tr><td>Documents</td><td>Supporting files</td><td>At least one file, or "No documents to upload" ticked</td></tr></tbody></table>
<h3>Tips per tab</h3>
<ul><li><strong>General Information.</strong> Fill this in first. <strong>Project partners</strong> are the organizations that receive CRAF'd funds directly; they become the rows of the tranche schedule. If a partner is missing from the list, contact CRAF'd. <strong>Implementing organizations</strong> can be typed in freely. Use the information icons for guidance on each field.</li><li><strong>Contacts.</strong> Link people from your Project Contacts, or add new ones, and give each a role: Primary focal point, Alternate focal point or Signatory. You can change contacts later.</li><li><strong>Work Plan.</strong> Items are numbered automatically: 1 (outcome), 1.1 (output), 1.1.1 (activity). Hover the information icons for what each level means.</li><li><strong>Indicators.</strong> The standard CRAF'd indicators are already listed and cannot be removed. Click <strong>Add indicator</strong> for your own: it needs a name, a description and a means of verification, and you choose whether it is reported annually or at closure.</li><li><strong>Risk Management.</strong> Click <strong>Add risk</strong> below the table, fill in the row and click <strong>Save</strong>. Likelihood runs from Rare to Very likely, impact from Insignificant to Extreme. The risk level is calculated for you.</li><li><strong>Budget.</strong> Enter the budget per category and year. Indirect support costs (7%) are added automatically and count towards the total. The total must match the requested funding: up to $1 under, never over. A message shows how far you are off.</li><li><strong>Tranche release schedule.</strong> Below the budget, enter how much each project partner receives per tranche, with a release date and the activities it covers. A release date is required for every amount. The schedule total must also match the requested funding.</li></ul>
<h3>Submitting the Project Document</h3>
<p>When every tab has a green tick, click <strong>Submit</strong> in the top bar and confirm. The document is then locked while CRAF'd reviews it. PRISM does not send an email: please let CRAF'd know at crafd@un.org that it is ready.</p>
$WIKI$),
('project-reports', 'Project Reports', 'FileEdit', 5, $WIKI$
<p>You submit an Annual Report for each year of the project and a Final Report at the end. Both have the same 13 sections, split into Qualitative and Quantitative. Open a report from <strong>Project Report</strong> in the sidebar or from Home.</p>
<p>Text fields have a word limit, shown under each box (most are 100 words).</p>
<table><thead><tr><th>Section</th><th>What you fill in</th><th>Needed for the tick</th></tr></thead><tbody><tr><td>Overview</td><td>Read the project details and the authorization statement</td><td>"I authorize this report" ticked</td></tr><tr><td>Survey</td><td>A rating from 1 to 5 for each question, and an explanation of your rating</td><td>A rating and an explanation for every question</td></tr><tr><td>Results</td><td>Cases where your data informed decisions: context, data-driven decision, resulting impact</td><td>At least 3 results, each with its context</td></tr><tr><td>Key Achievements</td><td>Up to 3 main achievements and why they matter</td><td>At least 1 achievement</td></tr><tr><td>Partnerships</td><td>Partner organizations and the result of each partnership</td><td>Every row has an organization, or "No partnerships to report" ticked</td></tr><tr><td>Lessons Learned</td><td>Up to 5 lessons: category, what you learned, what you changed</td><td>At least 1 lesson, with all three fields</td></tr><tr><td>External Coverage</td><td>The 3 most relevant pieces of coverage or engagement</td><td>3 descriptions</td></tr><tr><td>Testimonials</td><td>A quote from your leadership; optional quotes from partners or users; optional photos</td><td>Leadership quote with author and title; every photo has a caption and credits</td></tr><tr><td>Work Plan</td><td>The status of each activity this year</td><td>A status for every activity</td></tr><tr><td>Indicators</td><td>The value achieved and a status for each indicator</td><td>A value and a status for every indicator</td></tr><tr><td>Budget</td><td>Actual expenditure per category, and transfers to implementing partners</td><td>At least one expenditure above 0, and transfers filled in or "No transfers to report" ticked</td></tr><tr><td>Risk Management</td><td>What has changed for each risk; new risks</td><td>See below</td></tr><tr><td>Complementary Funding</td><td>Other funding the project received</td><td>Every row has a contributor and an amount, or "No complementary funding to report" ticked</td></tr></tbody></table>
<h3>Section details</h3>
<ul><li><strong>Work Plan.</strong> Each activity shows its planned quarters. Pick a status. If it is Delayed, At risk or Suspended, a second row opens to mark the updated quarters and add an explanation.</li><li><strong>Indicators.</strong> Baselines and targets come from the Project Document and are shown for reference. Annual Reports use the statuses On track, Off track and Ahead of schedule; the Final Report uses Achieved and Not achieved.</li><li><strong>Budget.</strong> The approved budget and the category descriptions come from the Project Document and cannot be changed here. Enter what was actually spent. Transfers to implementing partners are listed below the budget table.</li><li><strong>Complementary Funding.</strong> For in-kind contributions (for example services or staff time), give an estimated value in USD.</li><li><strong>Testimonials.</strong> Photos are optional. If you add one, give it a caption and credits.</li></ul>
<h3>Risk Management</h3>
<p>The risks from your Project Document and earlier reports are listed with their last rating. For each one, answer <strong>Since the last report, this risk…</strong>:</p>
<table><thead><tr><th>Answer</th><th>What to fill in</th></tr></thead><tbody><tr><td>has not changed</td><td>Nothing more</td></tr><tr><td>is more or less likely</td><td>The new likelihood and impact, and how you are adjusting your mitigation</td></tr><tr><td>has happened</td><td>The impact, and what happened and what you did</td></tr></tbody></table>
<p>To add a new risk, click <strong>Add risk</strong>. A new risk needs a name, a description, a likelihood and an impact.</p>
<h3>Submitting a report</h3>
<ol><li>Complete every section until it has a green tick.</li><li>On <strong>Overview</strong>, tick "I authorize this report".</li><li>Click <strong>Submit</strong> in the top bar and confirm.</li><li>Email crafd@un.org to let CRAF'd know it is ready. PRISM does not send an email.</li></ol>
<p>If Submit is greyed out, the message next to it tells you which section to complete first.</p>
$WIKI$),
('project-updates', 'Project Updates', 'ClipboardList', 6, $WIKI$
<p>A Project Update is how you request a change to your project, such as a budget revision, a no-cost extension, a tranche release or reprogramming. To request one, contact CRAF'd at crafd@un.org. CRAF'd then opens the update in PRISM with only the sections that apply, and you fill it in there.</p>
<p>The update appears under <strong>Project Update</strong> in the sidebar and on Home. Its name shows the year and the type of change, for example "2027-BR" for a budget revision.</p>
<h3>What you fill in</h3>
<ul><li><strong>Justification.</strong> Why you are requesting the change, what has changed and why it is needed (max. 100 words).</li><li><strong>The unlocked sections.</strong> For example Work Plan, Budget or Risk Management. They work like the same sections in a report. A budget revision adds columns for the revised budget; an extension adds the new years and quarters.</li><li><strong>HACT Recommendations</strong> (if shown). The findings and recommendations from CRAF'd's assurance activities. You only fill in the <strong>Partner comment</strong> to describe the action you have taken.</li></ul>
<p>An approved update changes your Project Document. Past reports stay as they were.</p>
<h3>Submitting an update</h3>
<p>When every section has a green tick, click <strong>Submit</strong> in the top bar and confirm. No authorization is needed. Then email crafd@un.org to let CRAF'd know it is ready.</p>
$WIKI$),
('statuses-and-submitting', 'Statuses and submitting', 'Workflow', 7, $WIKI$
<p>Every Project Document, report and update has a status. It is shown on the list pages and decides whether you can edit.</p>
<table><thead><tr><th>Status</th><th>What it means</th><th>Can you edit?</th></tr></thead><tbody><tr><td>To complete</td><td>You are filling it in</td><td>Yes</td></tr><tr><td>Under review</td><td>You have submitted it and CRAF'd is reviewing it</td><td>No</td></tr><tr><td>To revise</td><td>CRAF'd has sent it back with comments</td><td>Yes</td></tr><tr><td>Approved</td><td>CRAF'd has approved it</td><td>No</td></tr></tbody></table>
<p>The usual path is: To complete → Under review → Approved. If CRAF'd needs changes, the document goes to To revise; you update it, answer the comments and submit again.</p>
<p>On the Project Document, Project Report and Project Update pages, use the filter buttons at the top (All, To complete, Under review, To revise, Approved) to show only documents with that status.</p>
<h3>Submitting</h3>
<ul><li><strong>Submit</strong> appears in the top bar while a document is To complete or To revise.</li><li>It stays greyed out until every section has a green tick. The message next to it names the section to complete.</li><li>Reports also need "I authorize this report" ticked on the Overview section.</li><li>After you confirm, the document is locked for editing.</li><li>PRISM does not notify CRAF'd. Please email crafd@un.org to say it is ready for review.</li></ul>
<p>When a document is locked, a banner at the top says it is with the CRAF'd Secretariat for review, or that it has been approved. Contact CRAF'd if changes are needed.</p>
$WIKI$),
('comments', 'Comments', 'MessageSquare', 8, $WIKI$
<p>CRAF'd reviewers can leave comments on a section or on a specific item, such as a risk or an indicator.</p>
<h3>Where you see them</h3>
<ul><li>On Home: the <strong>Open comments</strong> tile, and "N comments to address" under the next step it belongs to.</li><li>Under the section heading in the document.</li><li>As a comment icon next to the item. It is yellow while the comment is open and grey once you have addressed it.</li></ul>
<h3>What you can do</h3>
<ol><li><strong>Read the comment</strong> and update your content if needed.</li><li><strong>Reply</strong> to explain what you changed or to answer a question. You can edit or delete your own replies.</li><li><strong>Mark as addressed</strong> when you have dealt with it. You can undo this.</li></ol>
<p>CRAF'd then reviews your reply and resolves the comment. Resolved comments disappear from your view. You can reply to comments even while a document is locked, but you cannot start a new comment yourself.</p>
<p>Tip: keep replies short and say what you changed, for example "Updated the baseline to 2024 data."</p>
$WIKI$),
('project-contacts', 'Project Contacts', 'Contact', 9, $WIKI$
<p><strong>Project Contacts</strong> lists the people at your organization. Each contact shows the projects they are linked to and their role on each.</p>
<ul><li><strong>Add a contact.</strong> Click <strong>Add contact</strong> below the list. Name, organization and email are required; job title is optional.</li><li><strong>Edit or delete.</strong> A change here updates the contact everywhere it is linked.</li><li><strong>Link to a project.</strong> Contacts are linked to a project, and given their roles, in the Project Document's General Information tab.</li></ul>
<table><thead><tr><th>Role</th><th>Meaning</th></tr></thead><tbody><tr><td>Primary focal point</td><td>CRAF'd's main contact for the project</td></tr><tr><td>Alternate focal point</td><td>The contact when the primary focal point is unavailable</td></tr><tr><td>Signatory</td><td>Signs the Project Document on behalf of your organization</td></tr></tbody></table>
<p>Keep contacts up to date when people join or leave.</p>
$WIKI$),
('saving-word-limits-and-completion', 'Saving, word limits and completion', 'CheckCircle2', 10, $WIKI$
<h3>Saving</h3>
<p>PRISM saves automatically as you type. The top bar shows "Saving…" and then "All changes saved". Some tables (such as new risks or contacts) have their own <strong>Save</strong> button.</p>
<h3>One person editing at a time</h3>
<p>Only one person can edit a document at a time. Because your organization shares one login, this can be a colleague. If someone else has it open, you see "{name} currently has this report open" and the page is read-only.</p>
<p>After 10 minutes without activity, your editing session ends so others can work. One minute before, you can click <strong>Keep editing</strong>. To continue after it has ended, click <strong>Start editing</strong>.</p>
<h3>Word limits</h3>
<p>Limited text boxes show a counter, for example "45/100 words". If you go over, the counter turns red. Your text is still saved, but the section does not get its green tick until you shorten it.</p>
<h3>Green ticks and progress</h3>
<ul><li>A section gets a green tick in the sidebar when it is complete.</li><li>The list pages show a progress bar for each document: the share of sections complete.</li><li>You can only submit when every section has a tick.</li></ul>
$WIKI$),
('printing', 'Printing', 'Printer', 11, $WIKI$
<p>You can print or save a PDF of a Project Document, report or update at any time.</p>
<ol><li>Open the document.</li><li>Click <strong>Print</strong> in the top bar. A print view opens.</li><li>In your browser's print dialog, choose <strong>Save as PDF</strong> to save the file, or pick a printer.</li></ol>
<p>The PDF contains every section with its current content. The text stays selectable and searchable.</p>
<p>To print this guide, click <strong>Print Guide</strong> at the top of the Guide page.</p>
$WIKI$),
('glossary', 'Glossary', 'Library', 12, $WIKI$
<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody><tr><td>PRISM</td><td>The CRAF'd platform for project documents, reports and updates</td></tr><tr><td>Project Document (ProDoc)</td><td>Your project's core document. It must be approved before funds are released</td></tr><tr><td>Annual Report</td><td>The report you submit for each year of the project</td></tr><tr><td>Final Report</td><td>The report you submit at the end of the project, due 6 months after the end date</td></tr><tr><td>Project Update</td><td>A request to change the project, such as a budget revision, no-cost extension, tranche release or reprogramming</td></tr><tr><td>Outcome / Output / Activity</td><td>The levels of your work plan: the change you aim for, the deliverables that lead to it, and the tasks that produce them</td></tr><tr><td>Indicator</td><td>A measurable value that tracks progress, with a baseline and a target</td></tr><tr><td>Standard indicator</td><td>An indicator set by CRAF'd for all projects; it cannot be removed</td></tr><tr><td>Custom indicator</td><td>An indicator you add for your own project</td></tr><tr><td>Baseline / Target</td><td>The value at the start of the project, and the value it aims to reach</td></tr><tr><td>Project partner</td><td>An organization that receives CRAF'd funds directly</td></tr><tr><td>Implementing organization</td><td>An organization that helps deliver the project</td></tr><tr><td>Tranche</td><td>A portion of the funding released at a set date</td></tr><tr><td>Indirect support costs (ISC)</td><td>A percentage (7%) added to direct costs to cover overheads</td></tr><tr><td>Complementary funding</td><td>Other funding the project received, in cash or in kind</td></tr><tr><td>Gender Equality Marker</td><td>A rating (GEM0 to GEM3) of how much the project contributes to gender equality</td></tr><tr><td>HACT</td><td>CRAF'd's assurance activities; findings may appear in a Project Update</td></tr><tr><td>Focal point</td><td>Your organization's main contact for CRAF'd on a project</td></tr><tr><td>Signatory</td><td>The person who signs the Project Document for your organization</td></tr><tr><td>Green tick</td><td>Shows a section is complete</td></tr></tbody></table>
$WIKI$),
('frequently-asked-questions', 'Frequently asked questions', 'HelpCircle', 13, $WIKI$
<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Why can't I edit a field?</td><td>The document may be Under review or Approved, a colleague may have it open, or the field comes from the Project Document or is managed by CRAF'd (for example approved budgets, standard indicators and baselines).</td></tr><tr><td>Why is Submit greyed out?</td><td>A section is not complete yet. The message next to the button names it. For reports, also tick "I authorize this report" on Overview.</td></tr><tr><td>A section won't get its green tick.</td><td>Check the required fields, and that no text is over its word limit (the counter turns red).</td></tr><tr><td>Does CRAF'd know I've submitted?</td><td>Not automatically. Please email crafd@un.org after you submit.</td></tr><tr><td>I work on several projects. How do I switch?</td><td>Each project has its own box on Home, and each document is listed in the sidebar.</td></tr><tr><td>A project partner is missing from the list.</td><td>Project partners are added by CRAF'd. Contact crafd@un.org.</td></tr><tr><td>How do I change something after submitting?</td><td>Contact CRAF'd. They can send the document back to you as To revise.</td></tr><tr><td>Who do I contact for help?</td><td>The CRAF'd Secretariat at crafd@un.org. For a technical problem, include a screenshot and a short description.</td></tr></tbody></table>
$WIKI$)
ON CONFLICT (slug) DO NOTHING;
