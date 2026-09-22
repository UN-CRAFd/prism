-- Flip indicators.is_standard to DEFAULT FALSE.
--
-- `is_standard` is the only thing separating the two tables on the indicators
-- tab: TRUE lands in "CRAF'd standard indicators", FALSE in "Customised project
-- indicators". The column defaulted to TRUE, so any INSERT that left the flag
-- off filed a partner-created indicator into the CRAF'd standard library — and
-- because indicators are a shared global vocabulary, it then showed up as
-- standard on every project that reused it.
--
-- Standard is now opt-in: the seed in schema.sql and the admin library page both
-- pass TRUE explicitly, and every other surface (the partner report editor and
-- both project-document editors) creates customs.
--
-- Non-destructive: changes the column default only. Existing rows are NOT
-- touched — see the commented-out statement at the bottom for reclassifying
-- indicators that were already mis-filed.
--
-- Idempotent: safe to run more than once. Run once against each live database.

SET search_path TO reporting_platform;

ALTER TABLE indicators ALTER COLUMN is_standard SET DEFAULT FALSE;

-- Existing mis-filed rows are left alone on purpose. The table has no
-- created_by column, so there is no way to tell a partner-created indicator
-- from a genuine CRAF'd standard one in SQL — it needs a human to read the
-- names. Review them with:
--
--   SELECT id, name, category, created_at
--     FROM reporting_platform.indicators
--    WHERE is_standard
--    ORDER BY created_at DESC;
--
-- and move the ones that do not belong in the CRAF'd library with:
--
--   UPDATE reporting_platform.indicators
--      SET is_standard = FALSE
--    WHERE id IN (...);
