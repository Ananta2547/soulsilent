-- Migration 076: edits to money ledger rows.
--
-- A row admin entered by hand can now be corrected in place (amount, date,
-- reference, payee, category, description, slip). Each save keeps what the
-- row said before and after, who changed it and why, so the ledger still
-- shows its history. Rows Beam wrote can only have their description edited.
CREATE TABLE IF NOT EXISTS money_tx_edits (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL,
  edited_by TEXT,
  edited_at TEXT DEFAULT (datetime('now')),
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_money_tx_edits_tx ON money_tx_edits(tx_id, edited_at);
