-- Migration 072: the sponsor / partner report a host can hand out
-- ("Organizer Impact Summary"). The figures are a snapshot taken from the
-- system when the report is made — the host picks which ones to show but can
-- never type a number in. The printed copy carries a QR to /r/<id>, where
-- anyone can check it against this row; the host can revoke it, and it
-- expires on its own. Totals only: no names, no contact details.
CREATE TABLE IF NOT EXISTS host_reports (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  activity TEXT,
  activity_title TEXT,
  figures_json TEXT NOT NULL,
  intro TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_host_reports_host ON host_reports(host_id);
