ALTER TABLE reporting_platform.projects
    ADD COLUMN IF NOT EXISTS project_start_date DATE;
