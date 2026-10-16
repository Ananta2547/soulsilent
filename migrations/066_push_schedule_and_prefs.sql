-- Migration 066: notifications when a round moves or is cancelled, and
-- per-member choice of which notifications to get.

-- The last schedule the push cron saw for each upcoming round: a JSON of
-- date / days / times / venue / online link / status. When the live row no
-- longer matches, the cron tells everyone booked (app/api/cron/push) and
-- stores the new one. A round seen for the first time is stored silently.
CREATE TABLE IF NOT EXISTS push_schedule (
  workshop_id TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL,
  seen_at TEXT DEFAULT (datetime('now'))
);

-- Kinds of notification a member switched off, comma-separated:
-- 'booking' (booked, friend joined), 'reminder' (evening before, 2 hours
-- before), 'host' (someone booked your round). Moves and cancellations are
-- always sent. No row = everything on. Applies to all of the member's devices.
CREATE TABLE IF NOT EXISTS push_prefs (
  user_id TEXT PRIMARY KEY,
  off TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
