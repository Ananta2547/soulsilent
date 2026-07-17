-- Migration 018: email verification flag
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
