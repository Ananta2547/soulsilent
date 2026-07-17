-- Migration 025: workshop reviews (one per user per workshop).
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,       -- 1..5 stars
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(workshop_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_workshop ON reviews(workshop_id);
