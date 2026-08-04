-- Remove the redundant organization_name column from partners.
-- short_name and long_name cover the full naming needs.

ALTER TABLE reporting_platform.partners DROP COLUMN IF EXISTS organization_name;
