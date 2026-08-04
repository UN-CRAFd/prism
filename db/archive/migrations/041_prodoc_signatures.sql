-- 041_prodoc_signatures.sql
-- Sign-off on the project document. Two parties sign a prodoc:
--   * 'contact'     — a project contact (partner_contacts, linked via
--                     project_contacts). Signed by the partner (or an admin).
--   * 'secretariat' — the CRAF'd Secretariat. Signed by an admin only. There is
--                     no Secretariat people table (the admin is a single fixed
--                     identity), so this row carries no contact_id.
--
-- Project-level (keyed by project_id), mirroring project_narratives /
-- project_sdg_targets. A signature is a click-to-sign stamp: signing inserts a
-- row (signed_at = now, signed_by = who signed); un-signing deletes it. The
-- signatures render on the exported project document.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS prodoc_signatures (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    party       TEXT         NOT NULL CHECK (party IN ('contact', 'secretariat')),
    contact_id  INTEGER      REFERENCES partner_contacts(id) ON DELETE CASCADE,
    signed_by   TEXT,
    signed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- A contact signature must name a contact; the Secretariat must not.
    CHECK (
        (party = 'contact' AND contact_id IS NOT NULL)
     OR (party = 'secretariat' AND contact_id IS NULL)
    )
);
-- One signature per contact per project, and at most one Secretariat signature.
CREATE UNIQUE INDEX IF NOT EXISTS prodoc_signatures_contact_uidx
    ON prodoc_signatures(project_id, contact_id) WHERE party = 'contact';
CREATE UNIQUE INDEX IF NOT EXISTS prodoc_signatures_secretariat_uidx
    ON prodoc_signatures(project_id) WHERE party = 'secretariat';
CREATE INDEX IF NOT EXISTS prodoc_signatures_project_idx ON prodoc_signatures(project_id);
DROP TRIGGER IF EXISTS prodoc_signatures_updated_at ON prodoc_signatures;
CREATE TRIGGER prodoc_signatures_updated_at
    BEFORE UPDATE ON prodoc_signatures
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
