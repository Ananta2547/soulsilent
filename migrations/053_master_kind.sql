-- A master is one of two kinds. 'round': the teacher opens repeating rounds
-- under it from the session manager. 'single': the admin creates each
-- workshop in จัดการ Workshop and links it here, the way it always worked —
-- so every master from before this migration is 'single'.
ALTER TABLE workshop_masters ADD COLUMN kind TEXT DEFAULT 'round';
UPDATE workshop_masters SET kind = 'single' WHERE kind IS NULL OR kind = 'round';
