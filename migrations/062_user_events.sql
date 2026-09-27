-- Migration 062: personal calendar events (design "Calendar v2" — ลงกิจกรรม).
-- A user's own entries next to the workshops on /calendar. Private — only
-- their owner reads or writes them. Days are YYYY-MM-DD, times HH:MM (both
-- Thailand wall clock); an all-day event keeps both times empty.
CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_day TEXT NOT NULL,
  end_day TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  time_start TEXT,
  time_end TEXT,
  -- 'me' | 'study' | 'meet' | 'trip'
  kind TEXT NOT NULL DEFAULT 'me',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id, start_day);
