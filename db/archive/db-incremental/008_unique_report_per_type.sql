-- Allow one report and one prodoc per project per year (previously only one of any type)
ALTER TABLE reporting_platform.reports
  DROP CONSTRAINT IF EXISTS reports_project_id_year_key;

ALTER TABLE reporting_platform.reports
  ADD CONSTRAINT reports_project_id_year_data_type_key
  UNIQUE (project_id, year, data_type);
