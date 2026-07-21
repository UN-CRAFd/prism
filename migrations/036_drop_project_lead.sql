-- 036_drop_project_lead.sql
-- Remove the project_lead field from project data — no longer captured.

SET search_path TO reporting_platform, public;

ALTER TABLE projects DROP COLUMN IF EXISTS project_lead;
