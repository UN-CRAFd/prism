-- add-comment-replies.sql
-- Adds one-level threading to item_comments.
--   parent_id   — nullable self-reference; NULL = top-level comment, set = reply.
--                 CASCADE so deleting a parent removes its replies (agreed with Niroj).
--   author_role — 'admin' | 'partner', set server-side from the session.
--                 `author` holds only a display name, which can't be trusted to
--                 identify the role (names change, partners can share a name).
-- One-level depth (a reply cannot itself be replied to) is enforced in the API,
-- not here — a CHECK constraint cannot inspect another row.

ALTER TABLE reporting_platform.item_comments
    ADD COLUMN IF NOT EXISTS parent_id INTEGER
        REFERENCES reporting_platform.item_comments(id) ON DELETE CASCADE;

ALTER TABLE reporting_platform.item_comments
    ADD COLUMN IF NOT EXISTS author_role TEXT;

ALTER TABLE reporting_platform.item_comments
    DROP CONSTRAINT IF EXISTS item_comments_author_role_check;

ALTER TABLE reporting_platform.item_comments
    ADD CONSTRAINT item_comments_author_role_check
        CHECK (author_role IS NULL OR author_role IN ('admin', 'partner'));

CREATE INDEX IF NOT EXISTS item_comments_parent_idx
    ON reporting_platform.item_comments (parent_id);