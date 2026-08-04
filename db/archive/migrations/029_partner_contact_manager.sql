-- Migration 029: give partner contacts a manager, forming an org hierarchy.
--
-- Self-referencing manager_id. ON DELETE SET NULL so removing a manager promotes
-- their reports to the top level rather than deleting them.

SET search_path TO reporting_platform;

ALTER TABLE partner_contacts
  ADD COLUMN IF NOT EXISTS manager_id INTEGER
  REFERENCES partner_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS partner_contacts_manager_id_idx ON partner_contacts(manager_id);
