-- 049_drop_partner_contact_manager.sql
-- The partner-contact manager hierarchy (self-referencing manager_id introduced
-- in 029) has been removed. Contacts are now a flat list per partner. Drop the
-- index and column. Idempotent.

SET search_path TO reporting_platform, public;

DROP INDEX IF EXISTS reporting_platform.partner_contacts_manager_id_idx;

ALTER TABLE reporting_platform.partner_contacts
  DROP COLUMN IF EXISTS manager_id;
