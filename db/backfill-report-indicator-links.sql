-- One-time: give existing report indicator lines the links from their
-- project's ProDoc line (reports created before links were copied).
-- Only fills lines that have no links yet. Idempotent.

SET search_path TO reporting_platform;

UPDATE indicator_data d
   SET linked_results = pd.linked_results
  FROM reports r
  JOIN reports prodoc ON prodoc.project_id = r.project_id AND prodoc.data_type = 'prodoc'
  JOIN indicator_data pd ON pd.report_id = prodoc.id
 WHERE d.report_id = r.id
   AND r.data_type = 'report'
   AND pd.indicator_id = d.indicator_id
   AND d.linked_results = '{}'
   AND pd.linked_results <> '{}';
