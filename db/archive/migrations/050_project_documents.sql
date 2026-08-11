-- 050_project_documents.sql
-- Adds project_documents: partner-uploaded documents/annexes attached to a
-- project's project document (annexes, budgets, agreements, …). Project-scoped.
-- File bytes are stored in the `content` bytea column — the app has no external
-- blob store, so uploads are capped small in the API. Never SELECT content in
-- list queries; only the single-file download route reads it. Idempotent.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS project_documents (
    id          SERIAL       PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type    TEXT         NOT NULL,
    doc_date    DATE,
    file_name   TEXT         NOT NULL,
    mime_type   TEXT,
    size_bytes  INTEGER      NOT NULL,
    content     BYTEA        NOT NULL,
    uploaded_by TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents(project_id);

DROP TRIGGER IF EXISTS project_documents_updated_at ON project_documents;
CREATE TRIGGER project_documents_updated_at
    BEFORE UPDATE ON project_documents
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
