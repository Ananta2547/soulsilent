-- Migration 069: a round activity's application form and PDPA switch.
--
-- Rounds are copies of their master, so the questions asked before booking
-- (workshops.application_form, migration 021) and the photo/video consent
-- switch (workshops.require_consent, migration 026) now live on the master
-- too. The host — or admin — edits them once per activity; a new round copies
-- them, and saving pushes them to every round that has not started yet.
-- Bookings already made keep the answers they gave.
ALTER TABLE workshop_masters ADD COLUMN application_form TEXT DEFAULT '[]';
ALTER TABLE workshop_masters ADD COLUMN require_consent INTEGER DEFAULT 0;
