-- Migration 067: coupons.
--
-- A coupon is one discount rule. It reaches people three ways:
--   public  — one code anyone may type (coupons.public_code)
--   unique  — a batch of single-use codes, printed as cards with a QR
--   wallet  — codes granted to a member's "คูปองของฉัน"
-- Unique and wallet codes are rows in coupon_codes; a unique card a member
-- scans moves into their wallet (owner_user_id set).
--
-- Usage is never stored as a counter. A coupon (or a code) is in use while a
-- booking that carries it is alive: not cancelled, not expired or refunded,
-- and not a pending hold past its 10 minutes. Cancelling a booking therefore
-- gives the coupon back by itself; an expired coupon simply stops validating.

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  -- percent: value = 1..100 (max_discount caps it) · amount: value = baht off
  -- free: 100% off · fixed_price: value = baht the booking costs
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount', 'free', 'fixed_price')),
  value INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  distribution TEXT NOT NULL CHECK (distribution IN ('public', 'unique', 'wallet')),
  public_code TEXT UNIQUE,
  -- Offer it on the checkout screen without typing.
  show_at_checkout INTEGER NOT NULL DEFAULT 0,
  -- 1 = applies on top of a promo price; 0 = counts from the full price and
  -- the cheaper of promo / coupon wins.
  stack_with_promo INTEGER NOT NULL DEFAULT 0,
  -- Who covers the discount: the host's share of it, 0..100 (asl = 0,
  -- host = 100, split = in between). The ASL part reaches the host's revenue
  -- through bookings.host_credit (lib/comp.ts hostGrossOf).
  funded_by TEXT NOT NULL DEFAULT 'asl' CHECK (funded_by IN ('asl', 'host', 'split')),
  host_share_pct INTEGER NOT NULL DEFAULT 0,
  -- Thai wall clock "YYYY-MM-DDTHH:MM"; NULL = no bound.
  starts_at TEXT,
  ends_at TEXT,
  max_uses INTEGER,
  per_user_limit INTEGER,
  min_spend INTEGER NOT NULL DEFAULT 0,
  -- all | masters | categories | hosts, with the matching ids / names in JSON.
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'masters', 'categories', 'hosts')),
  scope_json TEXT,
  -- JSON array of booking flows it works with: direct, group, selection,
  -- deposit, gift. NULL = all of them.
  kinds_json TEXT,
  first_booking_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_codes (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  -- The member whose wallet holds it (granted, or a card they scanned).
  owner_user_id TEXT,
  claimed_at TEXT,
  -- Which batch a printed card came from.
  batch TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_coupon ON coupon_codes(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_owner ON coupon_codes(owner_user_id);

-- Wrong codes typed, for the "too many tries" lock (10 in 10 minutes).
CREATE TABLE IF NOT EXISTS coupon_attempts (
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupon_attempts_user ON coupon_attempts(user_id, created_at);

-- What the booking would have cost without the coupon, the discount, and the
-- part of it the host bears. amount stays what the member pays; host_credit
-- gets the part ASL bears.
ALTER TABLE bookings ADD COLUMN coupon_id TEXT;
ALTER TABLE bookings ADD COLUMN coupon_code TEXT;
ALTER TABLE bookings ADD COLUMN list_amount INTEGER;
ALTER TABLE bookings ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN host_discount INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bookings_coupon ON bookings(coupon_id);
CREATE INDEX IF NOT EXISTS idx_bookings_coupon_code ON bookings(coupon_code);
