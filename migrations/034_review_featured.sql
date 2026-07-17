-- Admin-curated "featured" (ติดดาว) reviews, shown in the homepage slider.
ALTER TABLE reviews ADD COLUMN featured INTEGER DEFAULT 0;
