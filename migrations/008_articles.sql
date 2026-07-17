-- Migration 008: Articles (journal)
-- Single-locale per row to keep admin CRUD simple. Body is a JSON array of
-- typed blocks: [{ kind:'h2'|'h3'|'p'|'quote'|'image'|'caption', text, by?, swatch?, hint?, aspect? }]

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'slow',  -- slow / diary / howto / conversation / reflection / field
  tags_json TEXT DEFAULT '[]',
  title TEXT NOT NULL,
  excerpt TEXT,
  cover_swatch TEXT DEFAULT 'teal',       -- teal / cream / ink / accent
  cover_image_url TEXT,                   -- optional real photo (overrides swatch)
  body_json TEXT DEFAULT '[]',
  author_id TEXT REFERENCES users(id),
  read_minutes INTEGER DEFAULT 5,
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  date TEXT NOT NULL,                     -- YYYY-MM-DD (used for sort + display)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
