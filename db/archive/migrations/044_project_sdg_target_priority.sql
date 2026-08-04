-- 044_project_sdg_target_priority.sql
-- Distinguish each selected SDG target as a primary ("main") or secondary goal
-- of the project. Stored on project_sdg_targets as a small enumerated TEXT
-- column; existing rows default to 'primary'. Editable on the project document's
-- SDG Targets tab and grouped accordingly on the exported project document.

SET search_path TO reporting_platform, public;

ALTER TABLE project_sdg_targets
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'primary'
    CHECK (priority IN ('primary', 'secondary'));
