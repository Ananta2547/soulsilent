-- Migration 013: phone number on user profile (Account management)
-- Nullable — NULL means "not provided".

ALTER TABLE users ADD COLUMN phone TEXT;
