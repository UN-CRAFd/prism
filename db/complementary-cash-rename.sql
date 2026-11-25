-- Complementary funding type: "In Cash" is now just "Cash" (options.json).
--
-- The original 022_complementary migration created an inline CHECK
-- (funding_type IN ('In Cash', 'In Kind')). make-dropdowns-editable.sql dropped
-- the other dropdown CHECKs but missed this one, so it is dropped here — the app
-- (lib/options.ts + the admin options editor) is the source of truth for allowed
-- values. Then the stored values are renamed to match the new option.
-- Idempotent: safe to run more than once.

ALTER TABLE reporting_platform.complementary_contributors
  DROP CONSTRAINT IF EXISTS complementary_contributors_funding_type_check;

UPDATE reporting_platform.complementary_contributors
   SET funding_type = 'Cash'
 WHERE funding_type = 'In Cash';
