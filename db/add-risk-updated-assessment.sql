-- 053: Add updated_likelihood / updated_impact to risk_management
--
-- Context:
--   * risk_management.likelihood and risk_management.impact are the ProDoc-approved
--     (admin-defined) baseline assessments.
--   * updated_likelihood and updated_impact are the partner's current assessment,
--     filled in during annual / final report submission.
--
-- Before this migration both assessment values shared a single column pair, so
-- existing report rows contain partner-entered values in likelihood/impact.
--
-- Migration steps (all within one transaction):
--   1. Detect the schema state by checking which of the two new columns exist:
--        * Neither exists   → proceed with all steps below.
--        * Both exist       → migration already applied; emit a NOTICE and exit.
--        * Exactly one      → partial/inconsistent schema; RAISE EXCEPTION and roll back.
--   2. Add both new nullable columns.
--   3. For each existing annual/final report risk row, copy the current
--      likelihood and impact (partner-entered) into updated_likelihood and
--      updated_impact.
--   4. Clear likelihood and impact on those report rows so the columns are
--      free to hold only the approved ProDoc baseline going forward.
--   5. Backfill likelihood and impact on report rows from the matching ProDoc
--      risk using an exact risk_name match scoped to the same project.
--      Only updates when there is exactly one ProDoc risk row with that
--      risk_name — leaves NULL for zero or multiple matches (ambiguous).
--   6. ProDoc rows (data_type = 'prodoc') are untouched throughout; their
--      likelihood and impact already represent the approved baseline.
--
-- Re-run safety:
--   The migration is guarded by an existence check in Step 1. If both columns
--   already exist the body is skipped entirely, so no partner-entered
--   updated_likelihood / updated_impact values are ever overwritten.
--   A partial schema (one column but not the other) is treated as an error
--   so the operator can investigate before proceeding.

BEGIN;

DO $$
DECLARE
  has_updated_likelihood BOOLEAN;
  has_updated_impact     BOOLEAN;
BEGIN

  -- Detect which columns already exist.
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'reporting_platform'
         AND table_name   = 'risk_management'
         AND column_name  = 'updated_likelihood'
    ),
    EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'reporting_platform'
         AND table_name   = 'risk_management'
         AND column_name  = 'updated_impact'
    )
  INTO has_updated_likelihood, has_updated_impact;

  -- Guard: inconsistent schema — one column exists, the other does not.
  IF has_updated_likelihood <> has_updated_impact THEN
    RAISE EXCEPTION
      'Migration 053 error: partial schema detected. '
      'updated_likelihood exists=%, updated_impact exists=%. '
      'Investigate before re-running.',
      has_updated_likelihood, has_updated_impact;
  END IF;

  -- Guard: migration already applied — both columns present, nothing to do.
  IF has_updated_likelihood AND has_updated_impact THEN
    RAISE NOTICE
      'Migration 053 already applied: both updated_likelihood and '
      'updated_impact exist. Skipping all data-changing steps.';
    RETURN;
  END IF;

  -- Step 2: Add both columns (neither exists at this point).
  ALTER TABLE reporting_platform.risk_management
    ADD COLUMN updated_likelihood SMALLINT CHECK (updated_likelihood BETWEEN 1 AND 5),
    ADD COLUMN updated_impact     SMALLINT CHECK (updated_impact     BETWEEN 1 AND 5);

  -- Step 3: Preserve partner-entered assessments in the new updated_* columns.
  UPDATE reporting_platform.risk_management rm
     SET updated_likelihood = rm.likelihood,
         updated_impact     = rm.impact
    FROM reporting_platform.reports r
   WHERE r.id = rm.report_id
     AND r.data_type = 'report';

  -- Step 4: Clear the now-misnamed approved columns on report rows.
  UPDATE reporting_platform.risk_management rm
     SET likelihood = NULL,
         impact     = NULL
    FROM reporting_platform.reports r
   WHERE r.id = rm.report_id
     AND r.data_type = 'report';

  -- Step 5: Backfill approved values from the ProDoc for exact, unique risk_name
  -- matches within the same project. A subquery first finds ProDoc risk rows
  -- whose risk_name is unique within the project (COUNT = 1); only those are
  -- included. Report rows with no match or with multiple matches remain NULL.
  --
  -- FROM lists report_r and unique_prodoc without referencing the UPDATE target
  -- (report_rm) in any JOIN ON condition; all correlations to the target are
  -- expressed in the WHERE clause, which is the form PostgreSQL requires.
  UPDATE reporting_platform.risk_management report_rm
     SET likelihood = unique_prodoc.likelihood,
         impact     = unique_prodoc.impact
    FROM reporting_platform.reports report_r,
         (
           SELECT rm.risk_name,
                  rm.likelihood,
                  rm.impact,
                  r.project_id
             FROM reporting_platform.risk_management rm
             JOIN reporting_platform.reports r
               ON r.id = rm.report_id
              AND r.data_type = 'prodoc'
            WHERE (
              SELECT COUNT(*)
                FROM reporting_platform.risk_management rm2
                JOIN reporting_platform.reports r2
                  ON r2.id = rm2.report_id
                 AND r2.data_type = 'prodoc'
               WHERE r2.project_id = r.project_id
                 AND rm2.risk_name = rm.risk_name
            ) = 1
         ) unique_prodoc
   WHERE report_rm.report_id          = report_r.id
     AND report_r.data_type           = 'report'
     AND unique_prodoc.project_id     = report_r.project_id
     AND unique_prodoc.risk_name      = report_rm.risk_name;

END;
$$;

COMMIT;
