-- Reason a booking ended up "unsuccessful", drives the red remark on My Bookings.
-- Codes: payment_failed, seat_full, not_registered, incomplete_days, workshop_changed.
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT;
