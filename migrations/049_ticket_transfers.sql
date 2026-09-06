-- Migration 049: gift + transfer of a seat to another person.
--
-- One row per handover attempt. It is created when the link is minted (the
-- buyer finishes a gift purchase, or a ticket holder asks to pass their seat
-- on) and closed when the receiver claims it. The seat itself never moves
-- table: claiming rewrites bookings.user_id, and this row is the record of who
-- gave it to whom.
--
-- Names and phones are SNAPSHOTS taken at the time, not joins: a gift is
-- addressed to someone who may not have an account yet, and the history must
-- still read correctly if either party later edits their profile.
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL,
  workshop_id  TEXT NOT NULL,
  -- 'gift'     — bought for someone else, never used by the buyer
  -- 'transfer' — the holder passes on a seat they already own
  kind         TEXT NOT NULL DEFAULT 'transfer',
  token        TEXT NOT NULL UNIQUE,
  -- 'pending' | 'claimed' | 'cancelled'
  status       TEXT NOT NULL DEFAULT 'pending',
  from_user_id TEXT,
  from_name    TEXT,
  from_phone   TEXT,
  to_user_id   TEXT,
  to_name      TEXT,
  to_phone     TEXT,
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  claimed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_workshop ON ticket_transfers(workshop_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_booking ON ticket_transfers(booking_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_token ON ticket_transfers(token);
