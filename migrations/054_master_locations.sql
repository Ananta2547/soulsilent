-- Venues a round master may run at (JSON string[] of locations.id). The
-- teacher picks one of these when opening a round; an empty list means any
-- venue the admin has set up.
ALTER TABLE workshop_masters ADD COLUMN location_ids_json TEXT;
