-- Migration 006: Booking hold + auto-expire
--
-- Each new booking gets a 10-minute hold. Until expires_at:
--   - the seat is counted as taken
--   - the user can return to Stripe to finish paying (recycle existing booking)
-- After expires_at (without payment):
--   - seat counting ignores the row → others can book
--   - if user comes back, a fresh booking with new hold is created
--
-- We don't bother flipping status='cancelled' on the row — lazy filter at
-- query time is enough. Admin can periodically clean up if they want.

ALTER TABLE bookings ADD COLUMN expires_at TEXT;
