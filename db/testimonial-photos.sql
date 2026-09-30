-- Testimonials can have several photos (used for leadership portraits).
-- Each photo is EITHER an external link OR an uploaded file, with its own
-- label and credits. Existing single photos on testimonials are copied in.
-- The old photo_* columns on testimonials are kept but no longer used.
-- Idempotent.

SET search_path TO reporting_platform;

BEGIN;

CREATE TABLE IF NOT EXISTS testimonial_photos (
    id                SERIAL       PRIMARY KEY,
    testimonial_id    INTEGER      NOT NULL REFERENCES testimonials(id) ON DELETE CASCADE,
    photo_link        TEXT,
    photo_content     BYTEA,
    photo_mime_type   TEXT,
    photo_file_name   TEXT,
    photo_size_bytes  INTEGER,
    photo_label       TEXT,
    photo_credits     TEXT,
    sort_order        INTEGER      NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS testimonial_photos_testimonial_idx ON testimonial_photos(testimonial_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE testimonial_photos TO prism_app;
GRANT USAGE, SELECT ON SEQUENCE testimonial_photos_id_seq TO prism_app;

INSERT INTO testimonial_photos
  (testimonial_id, photo_link, photo_content, photo_mime_type, photo_file_name,
   photo_size_bytes, photo_label, photo_credits, sort_order)
SELECT t.id, NULLIF(t.photo_link, ''), t.photo_content, t.photo_mime_type, t.photo_file_name,
       t.photo_size_bytes, t.photo_label, t.photo_credits, 1
  FROM testimonials t
 WHERE (COALESCE(t.photo_link, '') <> '' OR t.photo_content IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM testimonial_photos p WHERE p.testimonial_id = t.id);

COMMIT;
