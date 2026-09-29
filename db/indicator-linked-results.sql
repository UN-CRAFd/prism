-- Indicators link to workplan outcomes and objectives (multi) instead of one activity.
-- Keys: 'outcome:<n>' and 'objective:<objective_num>', where <n> is the part of
-- objective_num before the first dot. Existing activity links become a link to
-- that activity's objective. linked_activity_id is kept but no longer used.
-- Idempotent.

SET search_path TO reporting_platform;

BEGIN;

ALTER TABLE indicator_data
  ADD COLUMN IF NOT EXISTS linked_results TEXT[] NOT NULL DEFAULT '{}';

UPDATE indicator_data d
   SET linked_results = ARRAY['objective:' || trim(wa.objective_num)]
  FROM workplan_activities wa
 WHERE wa.id = d.linked_activity_id
   AND COALESCE(trim(wa.objective_num), '') <> ''
   AND d.linked_results = '{}';

COMMIT;
