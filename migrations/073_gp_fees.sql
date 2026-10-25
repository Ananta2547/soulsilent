-- Migration 073: the platform fee (GP) — tiered by the host's sales in the
-- previous month, per activity type, from 1 Jan 2570 (lib/gp.ts has the table).
--
-- workshops.fee_mode
--   'gp'     the round is charged GP by the table (the default from now on)
--   'manual' admin's own deduction (payout_deduction_type/value: none, a fixed
--            amount, or a percent) — the "advanced" override on the payout sheet
-- Rounds where admin already set a deduction keep it ('manual'), so no amount
-- owed to a host changes when this ships.
ALTER TABLE workshops ADD COLUMN fee_mode TEXT NOT NULL DEFAULT 'gp';
UPDATE workshops SET fee_mode = 'manual'
 WHERE payout_deduction_type IN ('fixed', 'percent') AND COALESCE(payout_deduction_value, 0) > 0;

-- The table rate a host is on in a month, fixed the first time that month is
-- needed (from the closed previous month), so a refund made later cannot move
-- a rate already in use. The Founding Host cut and the 0% first month are
-- applied on top (lib/gp.ts). kind: 'single' (ประเภท ข.) | 'round' (ประเภท ก.).
CREATE TABLE IF NOT EXISTS gp_months (
  host_id TEXT NOT NULL,
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  prev_sales REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL,
  computed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (host_id, month, kind)
);
