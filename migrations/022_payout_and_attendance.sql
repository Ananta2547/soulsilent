-- Migration 022: organizer payout config + per-day attendance
-- workshops payout fields: deduction (none/fixed/percent), status, remark, slip.
ALTER TABLE workshops ADD COLUMN payout_deduction_type TEXT DEFAULT 'none';
ALTER TABLE workshops ADD COLUMN payout_deduction_value REAL DEFAULT 0;
ALTER TABLE workshops ADD COLUMN payout_status TEXT DEFAULT 'pending';
ALTER TABLE workshops ADD COLUMN payout_remark TEXT;
ALTER TABLE workshops ADD COLUMN payout_slip_url TEXT;
ALTER TABLE workshops ADD COLUMN payout_slip_meta TEXT;
-- bookings: per-day check-in map, JSON {"0":1,"1":0} (dayIndex -> 1 present/0 absent).
ALTER TABLE bookings ADD COLUMN attendance_json TEXT;
