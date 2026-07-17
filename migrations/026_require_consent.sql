-- Migration 026: per-workshop PDPA photo/video consent toggle.
-- When 1, the booking application form shows a required consent section.
ALTER TABLE workshops ADD COLUMN require_consent INTEGER DEFAULT 0;
