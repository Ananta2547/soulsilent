-- Migration 077: settings of a round activity (workshop_masters kind 'round'),
-- and how admin pays each host.
--
-- activity_status: 'open' (normal) · 'paused' (shown, not bookable, no new rounds) ·
--         'draft' (hidden from the public, the host may prepare rounds) ·
--         'archived' (hidden everywhere, no new rounds; booked rounds still run)
-- age_min / age_max: copied into every round (workshops.min_age / max_age),
--         which the booking, invite and transfer checks already enforce.
-- close_days_before / close_time: booking for a round closes this many days
--         before its date at this Thai time; written into each round's
--         workshops.close_at (NULL = open until the round starts).
-- survey_json: { title, intro, questions } — the AAR survey every round of
--         the activity uses (lib/round-rules.ts).
-- Named apart from workshops.status / min_age / max_age because many queries
-- join the two tables and use those names bare.
ALTER TABLE workshop_masters ADD COLUMN activity_status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE workshop_masters ADD COLUMN age_min INTEGER;
ALTER TABLE workshop_masters ADD COLUMN age_max INTEGER;
ALTER TABLE workshop_masters ADD COLUMN close_days_before INTEGER;
ALTER TABLE workshop_masters ADD COLUMN close_time TEXT;
ALTER TABLE workshop_masters ADD COLUMN survey_json TEXT;

-- One row per host: where admin sends their earnings. Shown (and used to
-- fill the form) when admin records a payout in the money ledger.
CREATE TABLE IF NOT EXISTS host_payout_info (
  user_id TEXT PRIMARY KEY,
  bank TEXT,
  account_no TEXT,
  account_name TEXT,
  promptpay TEXT,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
