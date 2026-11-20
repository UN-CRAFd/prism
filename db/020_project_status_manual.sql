-- Project status is now automatic unless an admin picks one by hand.
-- status_manual = true marks a status chosen manually; the automatic rules
-- (src/lib/project-status.ts) skip those projects. Choosing "Automatic" in the
-- Projects list sets it back to false.
ALTER TABLE reporting_platform.projects
  ADD COLUMN IF NOT EXISTS status_manual BOOLEAN NOT NULL DEFAULT false;
