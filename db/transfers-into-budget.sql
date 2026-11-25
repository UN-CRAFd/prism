-- Transfers to Implementing Partners is now part of the Budget tab (section
-- "expenditure") instead of a tab of its own, and in the project-update module
-- matrix it is a Budget add-on ("+ transfers to implementing partners", stored
-- key still "transfers"; an add-on implies its base row "expenditure").
--
-- Existing project updates that unlocked the old "transfers" tab: swap it for
-- the Budget tab (keeping canonical tab order is the app's job — it always
-- filters its own ordered list by this array), and make sure their modules
-- carry the Budget base row. Idempotent: safe to run more than once.

SET search_path TO reporting_platform;

UPDATE reports
   SET unlocked_sections =
         array_remove(unlocked_sections, 'transfers')
         || CASE WHEN 'expenditure' = ANY (unlocked_sections) THEN '{}'::text[] ELSE '{expenditure}'::text[] END
 WHERE data_type = 'update'
   AND 'transfers' = ANY (unlocked_sections);

-- update_modules only exists once add-update-modules.sql has run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'reporting_platform' AND table_name = 'reports'
                AND column_name = 'update_modules') THEN
    UPDATE reporting_platform.reports
       SET update_modules = update_modules || '{expenditure}'::text[]
     WHERE data_type = 'update'
       AND 'transfers' = ANY (update_modules)
       AND NOT ('expenditure' = ANY (update_modules));
  END IF;
END $$;
