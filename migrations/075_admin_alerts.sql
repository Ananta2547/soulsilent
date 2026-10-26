-- Migration 075: Admin Insights alerts.
--
-- identity_changes — one row each time a member changes their own full name
-- or date of birth (profile page or the autofill vault). Filling a field that
-- was empty is not a change. Admin Insights raises an alert when one account
-- makes more than 3 changes within 12 months. Old and new values are kept so
-- admin can see what changed; admin only.
--   field   'name' | 'dob'
--   source  'profile' | 'vault'
-- Counting starts when this migration runs; earlier edits were never logged.
CREATE TABLE IF NOT EXISTS identity_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_identity_changes_user ON identity_changes(user_id, created_at);

-- An alert admin marked as seen ("รับทราบ"), hidden for every admin. The key
-- names the alert and the state it was in (e.g. a change count), so the same
-- alert comes back when that state moves on.
CREATE TABLE IF NOT EXISTS admin_alert_acks (
  alert_key TEXT PRIMARY KEY,
  acked_by TEXT,
  note TEXT,
  acked_at TEXT DEFAULT (datetime('now'))
);
