-- Migration 012: richer user profiles
-- Adds nickname/display name, birth date, bio, and cover photo + crop metadata.
-- avatar_meta enables re-cropping the existing avatar (per Image Upload Standard).

ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN date_of_birth TEXT;       -- YYYY-MM-DD
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN avatar_meta TEXT;         -- ImageMeta JSON (avatar crop)
ALTER TABLE users ADD COLUMN cover_image_url TEXT;     -- final cropped cover
ALTER TABLE users ADD COLUMN cover_image_meta TEXT;    -- ImageMeta JSON (cover crop)
-- NULL everywhere means "not set yet"
