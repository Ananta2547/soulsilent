-- Featured/highlight flag for workshops → shown in the homepage Hero fan.
ALTER TABLE workshops ADD COLUMN featured INTEGER DEFAULT 0;
