-- 052_app_settings.sql
-- Adds app_settings: a small key/value store for runtime-editable configuration
-- that must survive a redeploy (environment variables cannot be changed from
-- within the running app). Its first use is the admin login password: the admin
-- Settings page writes a scrypt hash under key 'admin_password_hash', and admin
-- login (src/app/api/auth/login) verifies against it, falling back to the
-- ADMIN_PASSWORD env var until a hash is stored. Idempotent; re-running is a no-op.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT         PRIMARY KEY,
    value       TEXT         NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();
