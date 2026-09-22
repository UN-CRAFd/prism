-- One-off backfill: copy the category from the standard question library onto
-- survey rows already snapshotted into reports, matching on exact question text
-- within the same report type. Rows whose wording has since diverged from the
-- library stay uncategorised, which is correct — they no longer correspond to a
-- library entry. Safe to re-run: it only touches rows where category IS NULL.

UPDATE reporting_platform.surveys s
   SET category = sq.category
  FROM reporting_platform.reports r,
       reporting_platform.standard_survey_questions sq
 WHERE r.id = s.report_id
   AND sq.report_type::text = r.report_type::text
   AND sq.question = s.question
   AND s.category IS NULL
   AND sq.category IS NOT NULL;