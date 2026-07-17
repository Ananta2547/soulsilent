-- Migration 003: Workshop filters (category + tags) + promotion fields
-- instructor_id already exists on workshops — we just use it from the form now.

ALTER TABLE workshops ADD COLUMN category TEXT;
ALTER TABLE workshops ADD COLUMN tags_json TEXT DEFAULT '[]';

-- Promo:
--   promo_price : discounted price (THB). Falls back to `price` when null.
--   promo_start : ISO date 'YYYY-MM-DD' or NULL
--   promo_end   : ISO date 'YYYY-MM-DD' or NULL
ALTER TABLE workshops ADD COLUMN promo_price REAL;
ALTER TABLE workshops ADD COLUMN promo_start TEXT;
ALTER TABLE workshops ADD COLUMN promo_end TEXT;

CREATE INDEX IF NOT EXISTS idx_workshops_category ON workshops(category);
CREATE INDEX IF NOT EXISTS idx_workshops_instructor ON workshops(instructor_id);
