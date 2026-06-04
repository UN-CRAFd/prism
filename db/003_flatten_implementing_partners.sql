SET search_path TO reporting_platform;

-- ── Replace implementing_partners join table with a plain text column ─────────

-- 1. Add the new text column to projects
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS implementing_partners TEXT;

-- 2. Drop the join table (indexes and FK constraints drop automatically)
DROP TABLE IF EXISTS implementing_partners CASCADE;

