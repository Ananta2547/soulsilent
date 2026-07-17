-- Migration 029: account lifecycle status.
--   account_status: 'active' | 'suspended' (admin) | 'pending_deletion' (self-delete, 30-day recover window)
--   deleted_at: timestamp when the user self-deleted (drives the 30-day window)
ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN deleted_at TEXT;
