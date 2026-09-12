-- Session-based booking: a master (the activity) carries the prices every
-- round inherits, and a booking records whether it took one seat or the
-- whole round.
ALTER TABLE workshop_masters ADD COLUMN price_group REAL;
ALTER TABLE workshop_masters ADD COLUMN price_private REAL;
ALTER TABLE workshop_masters ADD COLUMN default_max_participants INTEGER DEFAULT 20;
-- 'group' = one seat; 'private' = the whole round, no one else can join.
ALTER TABLE bookings ADD COLUMN booking_kind TEXT DEFAULT 'group';
-- The teacher who opened the round from the session manager (NULL for rounds
-- the admin created directly).
ALTER TABLE workshops ADD COLUMN created_by TEXT;
