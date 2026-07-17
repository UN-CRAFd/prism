-- Migration 028: partner contacts.
--
-- People working at a partner organization (name, role, email). Managed by the
-- CRAF'd Secretariat on the admin side and editable by the partner themselves.
-- Cascade-deleted with the partner.

SET search_path TO reporting_platform;

CREATE TABLE IF NOT EXISTS partner_contacts (
  id         SERIAL       PRIMARY KEY,
  partner_id INTEGER      NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name       TEXT         NOT NULL,
  role       TEXT,
  email      TEXT,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_contacts_partner_id_idx ON partner_contacts(partner_id);

DROP TRIGGER IF EXISTS partner_contacts_updated_at ON partner_contacts;
CREATE TRIGGER partner_contacts_updated_at
  BEFORE UPDATE ON partner_contacts
  FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
