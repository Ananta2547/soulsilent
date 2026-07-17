-- Migration 024: admission types, payment modes, round-based selection.
-- workshops:
--   admission_type:  'direct' (Type B) | 'selection' (Type A)
--   payment_type:    'free' | 'deposit' | 'paid'
--   deposit_amount:  fixed THB deposit when payment_type='deposit'
--   announce_at:         selection — when results unmask (Phase 2)
--   confirm_main_by:     selection — main-round confirm deadline
--   confirm_waitlist_by: selection — waitlist-round confirm deadline (after promotion)
ALTER TABLE workshops ADD COLUMN admission_type TEXT DEFAULT 'direct';
ALTER TABLE workshops ADD COLUMN payment_type TEXT DEFAULT 'paid';
ALTER TABLE workshops ADD COLUMN deposit_amount REAL DEFAULT 0;
ALTER TABLE workshops ADD COLUMN announce_at TEXT;
ALTER TABLE workshops ADD COLUMN confirm_main_by TEXT;
ALTER TABLE workshops ADD COLUMN confirm_waitlist_by TEXT;

-- bookings (applications):
--   app_status:    'applied' | 'approved' | 'waitlisted' | 'rejected'
--   waitlist_rank: queue position when waitlisted
--   confirmed_at:  set when the user confirms their selected seat
ALTER TABLE bookings ADD COLUMN app_status TEXT DEFAULT 'applied';
ALTER TABLE bookings ADD COLUMN waitlist_rank INTEGER;
ALTER TABLE bookings ADD COLUMN confirmed_at TEXT;
