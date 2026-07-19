-- Enforcing email verification at login would lock out every pre-existing
-- account. Grandfather all current users as verified; only sign-ups created
-- AFTER this migration start unverified (email_verified defaults to 0).
UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0;
