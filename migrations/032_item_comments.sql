-- 032_item_comments.sql
-- Admin comments on individual report items. One polymorphic table annotates any
-- row in any section table: (section, item_id) is a soft foreign key (item_id
-- NULL = a section-level comment, e.g. overview). report_id has a real FK so a
-- report's comments cascade on delete and load in one indexed query. Multiple
-- rows per item form a thread.
--
-- The entry's data line ("what the comment is about") is resolved live from the
-- section's source table via (section, item_id) when the partner feedback feed
-- loads — see /api/comments — so it always reflects the current row, not a
-- stale snapshot.
--
-- A comment carries two independent "addressed" confirmations: `resolved` is the
-- CRAF'd (admin) side, toggled from the report-editor comment popover;
-- `partner_addressed` is the partner side, toggled from the partner home feed.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS item_comments (
    id                SERIAL       PRIMARY KEY,
    report_id         INTEGER      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    section           TEXT         NOT NULL,
    item_id           INTEGER,
    body              TEXT         NOT NULL,
    resolved          BOOLEAN      NOT NULL DEFAULT FALSE,  -- CRAF'd-side confirmation
    partner_addressed BOOLEAN      NOT NULL DEFAULT FALSE,  -- partner-side confirmation
    author            TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent so re-running patches a table created before partner_addressed existed.
ALTER TABLE item_comments ADD COLUMN IF NOT EXISTS partner_addressed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS item_comments_lookup_idx ON item_comments (report_id, section, item_id);

DROP TRIGGER IF EXISTS item_comments_updated_at ON item_comments;
CREATE TRIGGER item_comments_updated_at
    BEFORE UPDATE ON item_comments
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
