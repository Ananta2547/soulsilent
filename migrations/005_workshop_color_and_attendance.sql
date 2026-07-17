-- Migration 005: Workshop theme color + booking attendance
--
-- theme_color : admin-picked accent for the calendar chip (#RRGGBB).
-- attended    : NULL = not marked yet (defaults to "attended" for past events),
--               1    = admin confirmed the user showed up,
--               0    = admin marked the user as a no-show (missed).

ALTER TABLE workshops ADD COLUMN theme_color TEXT;
ALTER TABLE bookings  ADD COLUMN attended INTEGER;
