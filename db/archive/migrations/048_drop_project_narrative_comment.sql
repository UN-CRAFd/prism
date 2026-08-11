-- 048_drop_project_narrative_comment.sql
-- The per-narrative single "comment" field on the project document has been
-- replaced by the threaded speech-bubble comments (the shared ItemComments /
-- comments table, keyed on the prodoc report + narrative row). Drop the now-unused
-- project_narratives.comment column. Idempotent.

SET search_path TO reporting_platform, public;

ALTER TABLE reporting_platform.project_narratives
  DROP COLUMN IF EXISTS comment;
