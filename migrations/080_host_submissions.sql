-- Migration 080: hosts create their own activities; admin approves them.
-- A host's single activity is a workshops row, a round activity a
-- workshop_masters row (its rounds are workshops rows under it). Until admin
-- approves, the row stays hidden from the public the way drafts already are
-- (workshops.status = 'draft', workshop_masters.activity_status = 'draft').
--   review_status  NULL = approved or made by admin (every existing row);
--                  'draft' | 'pending' | 'changes_requested' | 'rejected'
--   review_note    admin's note when asking for changes or rejecting
--   submitted_at / reviewed_at / reviewed_by   who decided what, when
--   created_by     the host who made it (admin-made rows stay NULL); workshops
--                  already has it (051, who opened a round)
--   pending_json   an approved activity's price / date edits waiting for
--                  admin; the live row keeps the old values until approved
ALTER TABLE workshops ADD COLUMN review_status TEXT;
ALTER TABLE workshops ADD COLUMN review_note TEXT;
ALTER TABLE workshops ADD COLUMN submitted_at TEXT;
ALTER TABLE workshops ADD COLUMN reviewed_at TEXT;
ALTER TABLE workshops ADD COLUMN reviewed_by TEXT;
ALTER TABLE workshops ADD COLUMN pending_json TEXT;
ALTER TABLE workshop_masters ADD COLUMN review_status TEXT;
ALTER TABLE workshop_masters ADD COLUMN review_note TEXT;
ALTER TABLE workshop_masters ADD COLUMN submitted_at TEXT;
ALTER TABLE workshop_masters ADD COLUMN reviewed_at TEXT;
ALTER TABLE workshop_masters ADD COLUMN reviewed_by TEXT;
ALTER TABLE workshop_masters ADD COLUMN created_by TEXT;
ALTER TABLE workshop_masters ADD COLUMN pending_json TEXT;
CREATE INDEX IF NOT EXISTS idx_workshops_review ON workshops(review_status) WHERE review_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_masters_review ON workshop_masters(review_status) WHERE review_status IS NOT NULL;
