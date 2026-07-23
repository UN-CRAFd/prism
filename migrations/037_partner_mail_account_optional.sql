-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 037: Make partners.mail_account optional
--
-- Email is not essential for a partner: login matches on short_name OR mail_account
-- (see api/auth/login), and the actual password is set by the partner via a share
-- link on first use (api/auth/magic). Requiring an email at creation forced admins
-- to invent placeholder addresses. Long name is the meaningful required identifier,
-- enforced in the app layer.
--
-- Dropping NOT NULL keeps the UNIQUE index; Postgres allows multiple NULLs in a
-- UNIQUE column, so several credential-less partners can coexist.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO reporting_platform;

ALTER TABLE partners ALTER COLUMN mail_account DROP NOT NULL;
