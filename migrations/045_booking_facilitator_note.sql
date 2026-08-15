-- Private staff note about a participant, written on the expanded application
-- card by the workshop's facilitator or an admin.
--
-- STAFF-ONLY. This can hold candid remarks (behaviour in class, things to watch
-- for), so it must never be returned on a participant-facing endpoint — see the
-- explicit column lists in /api/bookings (mine branch) and /api/me/journey.
ALTER TABLE bookings ADD COLUMN facilitator_note TEXT;
