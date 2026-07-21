-- 034_narrative_comment.sql
-- Add an editable comment alongside each project narrative answer.

SET search_path TO reporting_platform, public;

ALTER TABLE project_narratives ADD COLUMN IF NOT EXISTS comment TEXT;
