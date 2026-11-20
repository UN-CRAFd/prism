-- Work plan: an updated timeline only counts as input under a delay.
--
-- Partners now only tick quarters for a progress status of Delayed, At Risk or
-- Suspended; with no status, Achieved or On Track the timeline is unchanged and
-- the API stores no quarters (NULL). This clears the quarters that were saved
-- before that rule, so old entries follow it too. Status and comment are kept.
--
-- One-off data cleanup; safe to run more than once.

UPDATE reporting_platform.workplan_entries
   SET updated_quarters = NULL,
       updated_at       = NOW()
 WHERE updated_quarters IS NOT NULL
   AND (status IS NULL OR status NOT IN ('Delayed', 'At Risk', 'Suspended'));
