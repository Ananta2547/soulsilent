-- Deposit-refund slip attached per booking by admin on the attendance page.
-- Follows the global image standard: <field>_url (final image) + <field>_meta (crop JSON).
ALTER TABLE bookings ADD COLUMN refund_slip_url TEXT;
ALTER TABLE bookings ADD COLUMN refund_slip_meta TEXT;
