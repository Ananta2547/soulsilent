-- Migration 071: what the full Host Dashboard needs that was never recorded.
-- These start counting from the day this ships; nothing before can be
-- rebuilt, which is why they go in before the screens that use them.
--
-- bookings.paid_at — when the money (or a free seat) was secured. Sales are
--   counted by this date, not by booking date. Set by the triggers below on
--   every path that turns payment_status into 'paid', so no code path can
--   forget it. Existing paid rows get their confirm/booking time (payment
--   lands within the 15-minute hold, so the day is right).
-- bookings.source / utm_* / link_id / referrer_host — where the booking came
--   from, captured on the visitor's landing (lib/attribution.ts) and stored
--   when the booking is made. `source` is the classified bucket:
--   host_link | asl_campaign | social | search | asl_browse | direct.
ALTER TABLE bookings ADD COLUMN paid_at TEXT;
ALTER TABLE bookings ADD COLUMN source TEXT;
ALTER TABLE bookings ADD COLUMN utm_source TEXT;
ALTER TABLE bookings ADD COLUMN utm_medium TEXT;
ALTER TABLE bookings ADD COLUMN utm_campaign TEXT;
ALTER TABLE bookings ADD COLUMN link_id TEXT;
ALTER TABLE bookings ADD COLUMN referrer_host TEXT;

UPDATE bookings SET paid_at = COALESCE(confirmed_at, created_at)
 WHERE paid_at IS NULL AND (payment_status IN ('paid', 'refunded') OR status = 'confirmed');

CREATE TRIGGER IF NOT EXISTS trg_bookings_paid_at_insert
AFTER INSERT ON bookings
WHEN NEW.payment_status = 'paid' AND NEW.paid_at IS NULL
BEGIN
  UPDATE bookings SET paid_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_bookings_paid_at_update
AFTER UPDATE OF payment_status ON bookings
WHEN NEW.payment_status = 'paid' AND NEW.paid_at IS NULL
BEGIN
  UPDATE bookings SET paid_at = datetime('now') WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_bookings_paid_at ON bookings(paid_at);
CREATE INDEX IF NOT EXISTS idx_bookings_link ON bookings(link_id);

-- One row per visitor per activity page per Thai day (unique visitors/day).
-- `visitor` is a random id kept in the browser — no account, no IP.
CREATE TABLE IF NOT EXISTS activity_views (
  day TEXT NOT NULL,
  workshop_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, workshop_id, visitor)
);
CREATE INDEX IF NOT EXISTS idx_activity_views_ws ON activity_views(workshop_id, day);

-- How many times an activity card was on screen in a listing, per Thai day.
CREATE TABLE IF NOT EXISTS activity_impressions (
  day TEXT NOT NULL,
  workshop_id TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, workshop_id)
);

-- A host's own booking links (?ref=<id>), optionally tagged with UTM, and
-- the unique visitors who arrived through each, per Thai day.
CREATE TABLE IF NOT EXISTS host_links (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  workshop_id TEXT,
  label TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_host_links_host ON host_links(host_id);

CREATE TABLE IF NOT EXISTS link_clicks (
  day TEXT NOT NULL,
  link_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, link_id, visitor)
);
