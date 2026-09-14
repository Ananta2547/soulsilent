-- Group booking on round masters. One paid row (the "master booking") buys
-- group_size seats — the booker's own plus friends' — and carries an
-- invite_token; each friend who follows the link gets a row of their own
-- with parent_booking_id pointing back, amount 0, so check-in, journey and
-- the roster see a person per seat. Seat counting reads group_size off the
-- parent and 0 off members, so a group is never counted twice.
ALTER TABLE bookings ADD COLUMN group_size INTEGER;
ALTER TABLE bookings ADD COLUMN invite_token TEXT;
ALTER TABLE bookings ADD COLUMN parent_booking_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_invite_token ON bookings(invite_token);
CREATE INDEX IF NOT EXISTS idx_bookings_parent ON bookings(parent_booking_id);
