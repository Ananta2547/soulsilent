-- Per-workshop participant age restriction. NULL = no limit on that end.
ALTER TABLE workshops ADD COLUMN min_age INTEGER;
ALTER TABLE workshops ADD COLUMN max_age INTEGER;
