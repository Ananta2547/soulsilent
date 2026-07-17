-- Migration 019: single-use password-reset nonce
-- A random value embedded in each reset link. Requesting a new reset email
-- rotates it (invalidating older links); a successful reset clears it
-- (so the same link can't be replayed).
ALTER TABLE users ADD COLUMN reset_nonce TEXT;
