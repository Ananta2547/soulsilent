-- Web push for the installed app (PWA). One row per browser/device a member
-- allowed notifications on; a member can have several (phone + computer).
-- The endpoint is the push service URL the browser handed us; p256dh/auth are
-- its keys for encrypting payloads (RFC 8291). Rows whose endpoint answers
-- 404/410 are deleted by lib/push.ts.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- Notifications already sent, keyed by what they were about (e.g.
-- "remind-1d:<booking id>"), so the minute-by-minute cron never sends one twice.
CREATE TABLE IF NOT EXISTS push_sent (
  key TEXT PRIMARY KEY,
  sent_at TEXT DEFAULT (datetime('now'))
);
