-- When registration closes, set by the admin as Thai wall-clock
-- "YYYY-MM-DDTHH:MM" (the same shape as announce_at). NULL keeps the old
-- rule: booking closes the moment the event starts. Only admin-made
-- workshops get one; teacher-opened rounds leave it NULL.
ALTER TABLE workshops ADD COLUMN close_at TEXT;
