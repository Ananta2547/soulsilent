-- Migration 027: Workshop "master data" (overview) separated from sessions (rounds).
-- A master holds the activity's overview; each `workshops` row (a session/round)
-- optionally links to a master via master_id.
CREATE TABLE IF NOT EXISTS workshop_masters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  organizer TEXT,                     -- ผู้จัด
  cover_image_url TEXT,
  cover_image_meta TEXT,
  target_json TEXT DEFAULT '[]',      -- string[] เหมาะกับใคร
  takeaways_json TEXT DEFAULT '[]',   -- string[] ได้อะไรจากกิจกรรม
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE workshops ADD COLUMN master_id TEXT;
CREATE INDEX IF NOT EXISTS idx_workshops_master ON workshops(master_id);
