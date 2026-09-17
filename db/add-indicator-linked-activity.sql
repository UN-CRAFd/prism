-- Adds linked_activity_id to indicator_data: a nullable FK to a workplan
-- activity, letting a reported indicator line be tied to the activity it
-- supports. One activity may be linked from several indicators; each indicator
-- links to at most one activity. ON DELETE SET NULL so removing an activity
-- never silently deletes indicator rows.
--
-- roles.sql grants SELECT/INSERT/UPDATE/DELETE ON ALL TABLES in the schema,
-- so no additional GRANT is needed here.

ALTER TABLE reporting_platform.indicator_data
    ADD COLUMN IF NOT EXISTS linked_activity_id INTEGER
        REFERENCES reporting_platform.workplan_activities(id) ON DELETE SET NULL;
