-- password_set_at is the flag the magic-link flow reads to choose between
-- "set a password" and "enter your password". It is NULL for every partner, so a
-- share link treats a working account as new and overwrites its password.
--
-- Only IDMC is fixed here. It is the account Niroj and Antje use for review, so
-- a share link must not reset it underneath them. The remaining partners are
-- test accounts and are deliberately left in the first-run state so the real
-- onboarding flow can be exercised before partners are brought on.
--
-- NOW() is a stand-in: the column is only ever read as null / not-null, and the
-- moment the password was actually set was never recorded.

UPDATE reporting_platform.partners
   SET password_set_at = NOW()
 WHERE LOWER(short_name) = 'idmc'
   AND password_hash IS NOT NULL
   AND password_set_at IS NULL;