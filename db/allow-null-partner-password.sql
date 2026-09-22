-- Partners no longer get a password at creation. They set their own the first
-- time they open a share link, which is what password_set_at tracks. Both that
-- flow and the admin "Reset password" action need password_hash to be NULL-able:
-- a partner legitimately has no password until they choose one.
--
-- Only relaxes a constraint. Existing rows are untouched, and the login route
-- already refuses a partner whose password_hash is null.

ALTER TABLE reporting_platform.partners
  ALTER COLUMN password_hash DROP NOT NULL;