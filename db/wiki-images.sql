-- Images (screenshots) embedded in wiki sections. Stored in the DB like
-- testimonial photos and served from /api/wiki-images/<id>. Idempotent.

SET search_path TO reporting_platform;

BEGIN;

CREATE TABLE IF NOT EXISTS wiki_images (
    id          SERIAL       PRIMARY KEY,
    content     BYTEA        NOT NULL,
    mime_type   TEXT         NOT NULL,
    file_name   TEXT,
    size_bytes  INTEGER      NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, DELETE ON TABLE wiki_images TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE wiki_images_id_seq TO prism_app;

COMMIT;
