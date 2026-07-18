-- Server-synced autofill vault (identity/health/emergency) per user.
-- Was localStorage-only → didn't follow the user across browsers.
ALTER TABLE users ADD COLUMN vault_json TEXT;
