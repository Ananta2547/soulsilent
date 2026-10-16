-- Migration 065: daily counters for the installed app (PWA). Anonymous —
-- no user or device id, only how many times something happened on a Thai
-- calendar day (YYYY-MM-DD, UTC+7).
--   metric 'install'  a device installed the app (counted once per device)
--   metric 'open'     the installed app was opened (once per device per day)
CREATE TABLE IF NOT EXISTS app_stats (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);
