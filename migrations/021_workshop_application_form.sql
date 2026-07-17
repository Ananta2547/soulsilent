-- Migration 021: pre-booking application form
-- workshops.application_form: JSON array of ApplicationQuestion the admin defines
--   per workshop ({ id, label, type, required, options }).
-- bookings.application_json: snapshot of the applicant's answers + profile at
--   booking time (so it stays accurate even if the profile changes later).
ALTER TABLE workshops ADD COLUMN application_form TEXT DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN application_json TEXT;
