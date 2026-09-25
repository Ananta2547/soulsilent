-- Migration 059: after-action review (AAR) surveys.
-- One survey per workshop (a round is its own workshop row). The teacher
-- writes the questions; participants scan a QR code, sign in, and answer once
-- — only if they were checked in as present. The star rating at the end is
-- also written to `reviews`, so it shows wherever reviews already do.
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL UNIQUE,
  title TEXT,
  intro TEXT,
  questions_json TEXT NOT NULL DEFAULT '[]',
  is_open INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  workshop_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  booking_id TEXT,
  answers_json TEXT NOT NULL DEFAULT '{}',
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(survey_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_workshop ON survey_responses(workshop_id);
