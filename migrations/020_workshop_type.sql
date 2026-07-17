-- Migration 020: workshop scheduling type
--   'one_day'    → single `date`
--   'multi_day'  → consecutive range, `date` (start) .. `end_date`
--   'multi_part' → specific non-consecutive days listed in `dates_json`
-- `date` always holds the canonical/first day so existing listing, calendar
-- and sort-by-date logic keeps working unchanged.
ALTER TABLE workshops ADD COLUMN workshop_type TEXT DEFAULT 'one_day';
ALTER TABLE workshops ADD COLUMN end_date TEXT;
ALTER TABLE workshops ADD COLUMN dates_json TEXT DEFAULT '[]';
