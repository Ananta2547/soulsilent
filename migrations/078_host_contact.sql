-- Migration 078: the "บัญชีผู้จัด" page (admin only) keeps, per host, the
-- name admin pays and how to reach them. Empty fields fall back to what the
-- host filled in their own profile (users.vault_json) when the page shows them.
ALTER TABLE host_payout_info ADD COLUMN full_name TEXT;
ALTER TABLE host_payout_info ADD COLUMN nickname TEXT;
ALTER TABLE host_payout_info ADD COLUMN phone TEXT;
ALTER TABLE host_payout_info ADD COLUMN facebook TEXT;
ALTER TABLE host_payout_info ADD COLUMN line_id TEXT;
ALTER TABLE host_payout_info ADD COLUMN instagram TEXT;
