-- Grant prism_app DML on the new signatories table (roles.sql not re-run:
-- it contains password placeholders that would reset live credentials).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON reporting_platform.prodoc_signatories TO prism_app;
GRANT USAGE, SELECT
  ON SEQUENCE reporting_platform.prodoc_signatories_id_seq TO prism_app;