-- Migration 060: personal diary (design "Journey + Diary v2").
-- One row per user per day: up to 3 moods (family + optional nuance) and up to
-- 6 pages of text. Private — only its owner ever reads it.
CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  moods_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[""]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user ON diary_entries(user_id, day);

-- Months whose summary the user chose to keep in the book ("บันทึกลงสมุด").
CREATE TABLE IF NOT EXISTS diary_months (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month)
);

-- My Journey's old per-booking memory note moves into the diary page of the
-- workshop's day; this marks the bookings already carried over.
ALTER TABLE bookings ADD COLUMN journey_note_moved INTEGER DEFAULT 0;
