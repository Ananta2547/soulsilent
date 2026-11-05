-- Migration 081: a host asks to publish activities on their own. They fill
-- in who they are, their page and where to send their earnings; admin phones
-- them, then approves, which adds the 'self_publisher' role (roles_json) and
-- copies the contact and bank details into host_payout_info.
-- status: pending | changes_requested | approved | rejected
CREATE TABLE IF NOT EXISTS host_verifications (
  user_id TEXT PRIMARY KEY,
  full_name TEXT,
  nickname TEXT,
  phone TEXT,
  email TEXT,
  line_id TEXT,
  page_url TEXT,
  facebook TEXT,
  instagram TEXT,
  bank TEXT,
  account_no TEXT,
  account_name TEXT,
  promptpay TEXT,
  about TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  submitted_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_verifications_status ON host_verifications(status);
