-- Migration 028: per-session "target audience" (เหมาะกับใคร) list.
ALTER TABLE workshops ADD COLUMN target_json TEXT DEFAULT '[]';
