-- Add a human-readable document name to project_documents.
-- Nullable so existing rows are unaffected; required on new uploads (enforced in the API).
ALTER TABLE reporting_platform.project_documents
  ADD COLUMN IF NOT EXISTS doc_name TEXT;
