-- backfill-comment-author-role.sql
-- All 7 existing comments were authored by "CRAF'd Secretariat" (verified before
-- running). Setting author_role so the UI never has to handle a NULL-role case.
-- Scoped to NULL rows only, so re-running cannot overwrite roles set since.

UPDATE reporting_platform.item_comments
   SET author_role = 'admin'
 WHERE author_role IS NULL;