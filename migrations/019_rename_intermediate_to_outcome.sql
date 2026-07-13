-- Migration 019: rename workplan_activities.intermediate → outcome
--
-- The "intermediate outcome" grouping level is now surfaced in the UI simply as
-- "Outcome" (a cluster of objectives). Rename the column to match.

SET search_path TO reporting_platform;

ALTER TABLE workplan_activities RENAME COLUMN intermediate TO outcome;
