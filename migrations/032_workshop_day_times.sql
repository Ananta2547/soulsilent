-- Per-day operating hours for continuous (multi_day) & multi-part workshops.
-- JSON array: [{ "date": "YYYY-MM-DD", "time_start": "HH:MM", "time_end": "HH:MM" }].
-- one_day workshops leave this null and use the single time_start/time_end columns.
ALTER TABLE workshops ADD COLUMN day_times_json TEXT;
