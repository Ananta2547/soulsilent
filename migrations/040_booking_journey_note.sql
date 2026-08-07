-- Personal free-text memory note a user writes for a workshop on My Journey.
-- One note per booking (i.e. per user per workshop). Nullable — most bookings
-- have none.
ALTER TABLE bookings ADD COLUMN journey_note TEXT;
