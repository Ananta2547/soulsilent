-- Migration 079: notifications through LINE (Official Account + Messaging API).
-- A member links their LINE account once (LINE Login in the same provider, so
-- the user id matches the Official Account). While linked and not blocked,
-- every notification goes to LINE instead of the app (lib/push.ts).
--   line_user_id  the LINE user id (U + 32 hex) from LINE Login
--   line_blocked  1 after the member blocked / unfriended the Official Account
--                 (webhook "unfollow"); back to 0 on "follow"
ALTER TABLE users ADD COLUMN line_user_id TEXT;
ALTER TABLE users ADD COLUMN line_linked_at TEXT;
ALTER TABLE users ADD COLUMN line_blocked INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_line_user_id ON users(line_user_id) WHERE line_user_id IS NOT NULL;
