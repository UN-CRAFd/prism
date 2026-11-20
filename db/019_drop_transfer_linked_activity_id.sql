-- Migration 019: drop transfer_data.linked_activity_id.
-- Run this AFTER the code that reads transfer_data_activities (018) is deployed.
ALTER TABLE reporting_platform.transfer_data DROP COLUMN IF EXISTS linked_activity_id;
