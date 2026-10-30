-- HACT recommendations: "Should be addressed by" (run after hact-recommendations-project-scope.sql)
--
-- A free-text column CRAF'd fills in per recommendation (who, or by when, it
-- should be addressed). Admin-only, like finding and recommendation; enforced
-- in /api/hact-recommendations.

ALTER TABLE reporting_platform.hact_recommendations
    ADD COLUMN IF NOT EXISTS addressed_by TEXT NOT NULL DEFAULT '';
