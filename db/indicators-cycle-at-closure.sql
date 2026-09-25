-- Indicator reporting cycle: default everything to "at_closure".
--
-- Niroj decision (Sept 2026): all standard indicators report at closure, and
-- only admins change a standard indicator's cycle. Partners choose between
-- "yearly" (shown as "Annually") and "at_closure" for their own custom
-- indicators in the ProDoc editor.
--
-- 1. Sets every existing indicator (standard and custom) to at_closure.
-- 2. Makes at_closure the column default.
-- 3. Adds a CHECK so only the two valid keys can be stored.
--
-- Idempotent: safe to run more than once.

SET search_path TO reporting_platform;

BEGIN;

UPDATE indicators
   SET cycle = 'at_closure'
 WHERE cycle IS DISTINCT FROM 'at_closure';

ALTER TABLE indicators ALTER COLUMN cycle SET DEFAULT 'at_closure';

ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_cycle_check;
ALTER TABLE indicators
  ADD CONSTRAINT indicators_cycle_check CHECK (cycle IN ('yearly', 'at_closure'));

COMMIT;
