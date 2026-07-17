-- Migration 009: Article categories — admin-manageable
-- articles.category is TEXT pointing at one of these `key`s.
-- Deleting a category is blocked from the API when any article still uses it.

CREATE TABLE IF NOT EXISTS article_categories (
  key TEXT PRIMARY KEY,
  th TEXT NOT NULL,
  en TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed the existing 6 hardcoded categories
INSERT OR IGNORE INTO article_categories (key, th, en, sort_order) VALUES
  ('slow',         'การเรียนรู้แบบช้า', 'Slow Learning',   10),
  ('diary',        'ไดอารี่เวิร์กชอป',  'Workshop Diary',  20),
  ('howto',        'วิธีทำ',            'How-to',          30),
  ('conversation', 'บทสนทนา',          'Conversation',     40),
  ('reflection',   'บทสะท้อน',          'Reflection',      50),
  ('field',        'ภาคสนาม',          'Field Notes',      60);
