-- Standalone ProDoc signatories no longer require a name: the signatory is
-- often not known when the project document is drafted. Prints as "Name: ____".
-- Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE prodoc_signatories ALTER COLUMN signee_name DROP NOT NULL;

COMMIT;
