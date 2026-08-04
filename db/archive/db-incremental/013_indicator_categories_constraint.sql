-- Add CHECK constraint for indicator categories
-- Enforces that category must be one of the five standard categories or NULL

ALTER TABLE reporting_platform.indicators
  DROP CONSTRAINT IF EXISTS indicators_category_check,
  ADD CONSTRAINT indicators_category_check
    CHECK (category IN ('Data Outputs & Quality', 'Analytics Products', 'Access & Usage', 'Reach & Influence', 'Capacity & Partnerships'));
