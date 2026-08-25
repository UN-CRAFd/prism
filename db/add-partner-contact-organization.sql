-- Adds the organisation field to partner_contacts.
-- Nullable in the DB; the API requires it for new/updated records.
-- Idempotent: safe to re-run.

ALTER TABLE reporting_platform.partner_contacts
  ADD COLUMN IF NOT EXISTS organization VARCHAR(200);
