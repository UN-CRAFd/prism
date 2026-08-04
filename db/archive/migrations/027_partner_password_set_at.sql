-- Migration 027: track when a partner set their own password via a share link.
--
-- Share (magic) links no longer log a partner in automatically. On first use the
-- partner sets a password (which overwrites partners.password_hash); every use
-- afterwards requires re-entering it. `password_set_at` records the first-set
-- moment; NULL means "not yet set" → the link shows the set-password step.

SET search_path TO reporting_platform;

ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;
