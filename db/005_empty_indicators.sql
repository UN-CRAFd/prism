-- ─────────────────────────────────────────────────────────────────────────────
-- Empty indicators and indicator_sections tables
-- Run against: crafd database on un80-dev-pg.postgres.database.azure.com
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

-- Truncate dependent table first (has FK reference to indicators)
TRUNCATE TABLE indicator_sections CASCADE;

-- Then truncate indicators
TRUNCATE TABLE indicators CASCADE;
