-- Migration 014: Portfolio Builder
-- One portfolio per user. blocks_json holds the free-form canvas elements
-- (absolute-positioned: text / image / button / video). Public read uses the
-- `published` flag; the page is shared at /p/<id>.

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  title TEXT,
  bg_color TEXT DEFAULT '#ffffff',
  bg_image_url TEXT,
  -- Canvas height in px (width is responsive/fixed by the editor frame).
  canvas_height INTEGER DEFAULT 1400,
  -- JSON array of PortfolioBlock (see lib/types.ts).
  blocks_json TEXT DEFAULT '[]',
  published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
