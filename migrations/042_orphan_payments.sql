-- Records money that reaches Stripe but does NOT correspond to a legitimately
-- owed booking payment — i.e. a customer paid a saved/expired PromptPay QR after
-- the hold lapsed, or scanned the same QR twice (a repeat/excess payment). Stripe
-- can't block these at the bank, and it reimburses excess funds to our balance
-- expecting us to refund the customer manually. This table surfaces every such
-- payment on the admin reconcile page so nothing is missed.
--
-- Populated by the Stripe webhook on `charge.succeeded` when the charge's booking
-- is already confirmed by a different charge, is cancelled/expired, or is unknown.
CREATE TABLE IF NOT EXISTS orphan_payments (
  id            TEXT PRIMARY KEY,          -- Stripe charge id (py_...), idempotent
  payment_intent TEXT,                     -- pi_...
  booking_id    TEXT,                      -- matched booking, if any
  amount        INTEGER NOT NULL,          -- smallest unit (satang)
  currency      TEXT NOT NULL DEFAULT 'thb',
  email         TEXT,                      -- receipt_email from the charge
  reason        TEXT NOT NULL,             -- duplicate | late_cancelled | unknown
  resolved      INTEGER NOT NULL DEFAULT 0,-- 0 = needs handling, 1 = refunded/handled
  resolved_note TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orphan_payments_resolved ON orphan_payments(resolved, created_at);
