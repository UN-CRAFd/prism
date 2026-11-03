-- Testimonials: "Photos from the Ground"
--
-- A third kind of testimonials row, kind = 'ground': up to five project
-- implementation entries per report (cap enforced in the API). The row's
-- `quote` column holds the description & short caption; the photos themselves
-- — one per entry, upload or link, with its own caption and credits — are in
-- testimonial_photos. person_name and person_title stay empty.
--
-- Only the CHECK on testimonials.kind changes. The original was declared inline,
-- so its name depends on the database; drop whichever CHECK constraint covers
-- `kind`, then add the widened one under a fixed name. Idempotent.
--
-- Run with an admin account:
--   node --env-file=.env db/run-sql.mjs db/add-testimonial-ground-photos.sql

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class     rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
     WHERE ns.nspname  = 'reporting_platform'
       AND rel.relname = 'testimonials'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE reporting_platform.testimonials DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE reporting_platform.testimonials
  ADD CONSTRAINT testimonials_kind_check
  CHECK (kind IN ('leadership', 'partner', 'ground'));
