-- Migration 002: Location master data + Workshop schedule/learn extras

-- Locations master table
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  subdistrict TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_locations_province ON locations(province);

-- Add columns to workshops:
--   location_id     → FK to locations.id (nullable, falls back to legacy `location` string)
--   schedule_json   → JSON array of { time, detail } items for timeline
--   learn_json      → JSON array of strings — "what you'll learn" bullet points
ALTER TABLE workshops ADD COLUMN location_id TEXT REFERENCES locations(id);
ALTER TABLE workshops ADD COLUMN schedule_json TEXT DEFAULT '[]';
ALTER TABLE workshops ADD COLUMN learn_json TEXT DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_workshops_location ON workshops(location_id);
