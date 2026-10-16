-- Project Updates (V1)
-- 1) A Project Update is a reports row with data_type = 'update',
--    alongside 'report' (annual/final reports) and 'prodoc'.
-- 2) unlocked_sections lists which tabs the admin unlocked for that update
--    (e.g. {workplan,risk,expenditure}). Empty for reports and prodocs.

ALTER TYPE reporting_platform.data_type_enum ADD VALUE IF NOT EXISTS 'update';

ALTER TABLE reporting_platform.reports
  ADD COLUMN IF NOT EXISTS unlocked_sections TEXT[] NOT NULL DEFAULT '{}';
