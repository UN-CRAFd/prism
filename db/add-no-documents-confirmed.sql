-- Partner explicitly confirms the project document has no documents to upload.
-- The Documents tab counts as complete when at least one document is uploaded
-- OR this flag is set. Cleared automatically when a document is uploaded.
ALTER TABLE reporting_platform.projects
  ADD COLUMN IF NOT EXISTS no_documents_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
