-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-08  contacts-roles
--
-- Restructures the two contacts tables:
--
--   partner_contacts.role  → renamed to job_title, widened to TEXT.
--     The column holds the person's job title at their organisation; VARCHAR(100)
--     was too narrow and the name "role" was ambiguous once project_contacts
--     gained its own roles field.
--
--   project_contacts.relationship → renamed to roles (TEXT).
--     Becomes a '|'-delimited multi-value field.
--     Valid values: Primary focal point | Alternate focal point | Signatory | Applicant
--
--   project_contacts.is_applicant → dropped.
--     The applicant status is now expressed as the 'Applicant' value in roles,
--     so the separate boolean column is redundant.
--
-- All existing values are test data; roles is cleared rather than migrated.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

SET search_path TO reporting_platform;

-- 1. partner_contacts: rename role → job_title, widen to TEXT
ALTER TABLE partner_contacts RENAME COLUMN role TO job_title;
ALTER TABLE partner_contacts ALTER COLUMN job_title TYPE TEXT;

-- 2. project_contacts: rename relationship → roles
ALTER TABLE project_contacts RENAME COLUMN relationship TO roles;
UPDATE project_contacts SET roles = NULL;

-- 3. project_contacts: drop is_applicant (merged into roles as 'Applicant')
ALTER TABLE project_contacts DROP COLUMN is_applicant;

COMMIT;
