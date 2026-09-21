-- Adds an optional category to the standard survey question library and to the
-- per-report snapshot. Nullable by design: existing questions stay uncategorised
-- until assigned in /admin/survey-questions, and no backfill is performed.
-- Reports created before this keep their rows unchanged.

ALTER TABLE reporting_platform.standard_survey_questions
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE reporting_platform.surveys
  ADD COLUMN IF NOT EXISTS category TEXT;