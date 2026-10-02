-- The quote on the Diary's back cover: one per day per user, drawn without
-- repeats until the whole list has been shown, then reshuffled. Drawn only on
-- a day the user opens their diary, so idle days do not use up quotes.
CREATE TABLE IF NOT EXISTS user_quote_state (
  user_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,              -- YYYY-MM-DD (Thailand) the current quote was drawn
  current INTEGER NOT NULL,       -- index into DIARY_QUOTES
  remaining_json TEXT NOT NULL,   -- indexes not yet shown in this round
  updated_at TEXT DEFAULT (datetime('now'))
);
