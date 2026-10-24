-- Migration 070: the money ledger — a log of every movement of money,
-- recorded by its transaction reference instead of a pasted slip.
--
-- One row = money in or out once.
--   direction  'in'  (a participant paid through Beam)
--              'out' (a refund to a participant, a host's payout, a business
--                     expense, and — kept for later — payroll)
--   doc_no     running document number, PV-2569-0001 for money out (the
--              payment voucher), RV-2569-0001 for money in; see doc_counters
--   gross / withholding / net  baht; withholding is 0 until the business is
--              registered and starts withholding tax on host payouts
--   method     beam | bank_transfer | promptpay | cash | bank_api | other
--   ref_id / ref_source  the transaction reference and where it came from
--              (beam | bank_slip | bank_api | manual | legacy). A bank
--              transfer must have one; cash gives no_ref_reason instead.
--              One reference is recorded once (partial unique index).
--   occurred_at  Thai wall clock 'YYYY-MM-DDTHH:MM' of the transfer
--   payee_*    who received the money out; the account is stored masked
--   booking_id / workshop_id / host_id / user_id / category_id  what it was for
--   slip_url / slip_meta  an optional attachment — admin only
--   status     'done' or 'void'. Rows are never deleted; a voided row keeps
--              who voided it, when and why.
--   voucher_token  unguessable id for the voucher link sent by email
--   legacy     1 = imported from the slips that existed before this ledger
CREATE TABLE IF NOT EXISTS money_tx (
  id TEXT PRIMARY KEY,
  doc_no TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  gross REAL NOT NULL,
  withholding REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL,
  method TEXT NOT NULL,
  ref_id TEXT,
  ref_source TEXT,
  no_ref_reason TEXT,
  occurred_at TEXT NOT NULL,
  payee_name TEXT,
  payee_bank TEXT,
  payee_account TEXT,
  payee_email TEXT,
  user_id TEXT,
  booking_id TEXT,
  workshop_id TEXT,
  host_id TEXT,
  category_id TEXT,
  description TEXT,
  slip_url TEXT,
  slip_meta TEXT,
  legacy INTEGER NOT NULL DEFAULT 0,
  voucher_token TEXT NOT NULL UNIQUE,
  emailed_at TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  voided_by TEXT,
  voided_at TEXT,
  void_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_money_tx_ref ON money_tx(ref_source, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_tx_booking ON money_tx(booking_id);
CREATE INDEX IF NOT EXISTS idx_money_tx_workshop ON money_tx(workshop_id);
CREATE INDEX IF NOT EXISTS idx_money_tx_when ON money_tx(occurred_at);
CREATE INDEX IF NOT EXISTS idx_money_tx_kind ON money_tx(kind, status);

-- Next number per prefix ('PV-2569', 'RV-2569').
CREATE TABLE IF NOT EXISTS doc_counters (
  prefix TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);

-- Business expense categories; admin adds, renames and hides them.
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO expense_categories (id, name, sort) VALUES
  ('venue', 'ค่าสถานที่', 1),
  ('equipment', 'อุปกรณ์', 2),
  ('marketing', 'การตลาด / โฆษณา', 3),
  ('software', 'ซอฟต์แวร์ / โดเมน', 4),
  ('travel', 'ค่าเดินทาง', 5),
  ('other', 'อื่น ๆ', 99);
