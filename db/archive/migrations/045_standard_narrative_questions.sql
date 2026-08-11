-- 045_standard_narrative_questions.sql
-- Make the project-document narrative question set admin-editable (add / edit /
-- remove), mirroring standard_survey_questions. Previously the question set lived
-- as a static list in labels.json; now it is a global admin-authored library that
-- is SNAPSHOTTED into each project's project_narratives at project creation, so
-- every project owns its own set to fill out and later edits to the library leave
-- existing projects untouched (same contract as surveys).

SET search_path TO reporting_platform, public;

-- ── Global library of narrative questions ────────────────────────────────────
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

-- Seed with the historical labels.json question set (idempotent).
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

-- ── project_narratives becomes a self-contained snapshot ─────────────────────
-- Carry the question label + ordering on the row so a project keeps its own copy
-- even after the library question is edited or removed.
ALTER TABLE project_narratives ADD COLUMN IF NOT EXISTS label       TEXT;
ALTER TABLE project_narratives ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE project_narratives ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

-- Backfill label + sort_order on existing rows from the library seed.
UPDATE project_narratives pn
   SET label      = COALESCE(pn.label, sq.label),
       sort_order = sq.sort_order
  FROM standard_narrative_questions sq
 WHERE sq.narrative_key = pn.narrative_key
   AND (pn.label IS NULL OR pn.sort_order = 0);

-- Backfill any legacy project missing the current library questions, so every
-- existing project has the full set to fill out (empty answers).
INSERT INTO project_narratives (project_id, narrative_key, label, description, sort_order)
SELECT p.id, sq.narrative_key, sq.label, sq.description, sq.sort_order
  FROM reporting_platform.projects p
  CROSS JOIN standard_narrative_questions sq
ON CONFLICT (project_id, narrative_key) DO NOTHING;
