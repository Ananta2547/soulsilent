-- Migration 007: Location master-data upgrade
--   - amenities + details
--   - admin-only internal note
--   - link to a User as owner
--   - gallery (JSON array of media URLs) — first item is the "main"
--   - graphic_map_url for illustration/sketch map

ALTER TABLE locations ADD COLUMN details TEXT;
ALTER TABLE locations ADD COLUMN map_url TEXT;
ALTER TABLE locations ADD COLUMN car_parking INTEGER DEFAULT 0;
ALTER TABLE locations ADD COLUMN motorcycle_parking INTEGER DEFAULT 0;
ALTER TABLE locations ADD COLUMN internal_note TEXT;
ALTER TABLE locations ADD COLUMN owner_id TEXT REFERENCES users(id);
ALTER TABLE locations ADD COLUMN gallery_json TEXT DEFAULT '[]';
ALTER TABLE locations ADD COLUMN graphic_map_url TEXT;

CREATE INDEX IF NOT EXISTS idx_locations_owner ON locations(owner_id);
