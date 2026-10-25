-- Migration 074: admin settings — small values admin sets from the dashboard.
--
-- One row = one setting, stored as text. The first ones are the Beam fee rates
-- Admin Insights uses to estimate what the gateway took (Beam does not report
-- its fee per charge), in percent of the amount charged:
--   beam_fee_qr    PromptPay QR charges (bookings.beam_qr_charge_id set)
--   beam_fee_card  every other Beam charge (payment link: card, wallets …)
-- Both start empty, so the dashboard says the fee is not set rather than
-- guessing a number.
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
