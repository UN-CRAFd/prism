-- Give older project updates the Overview page.
--
-- Overview carries the project details, the authorization checkbox and the
-- "what this document consists of" note. Updates created before it became
-- unconditional have no 'overview' in unlocked_sections, so they open without
-- it. This adds it, leaving every other tab alone.
--
-- Safe to re-run: the guard skips updates that already have it.
--
-- NOTE: this cannot restore update_types on those rows. Nothing recorded which
-- types they covered, so their Overview will name the document but omit the
-- "It consists of …" sentence. Only updates created through the module matrix
-- carry that.

UPDATE reporting_platform.reports
   SET unlocked_sections = ARRAY['overview'] || unlocked_sections
 WHERE data_type = 'update'
   AND NOT ('overview' = ANY(unlocked_sections));
