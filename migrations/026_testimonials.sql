-- Migration 026: testimonials qualitative sub-section
--
-- One quote from the organisation's leadership (kind = 'leadership', exactly one
-- per report) plus up to three quotes from partners or users of the project's
-- data (kind = 'partner'). Each row carries the quote, who said it, and photo
-- metadata. The per-kind caps are enforced in the API (/api/testimonials).

SET search_path TO reporting_platform;

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
