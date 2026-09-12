-- Identity edits in the autofill vault are limited to one per 30 days.
-- Holds the moment of the last counted identity edit; NULL means the user has
-- only ever filled identity in once (onboarding), which does not start the clock.
ALTER TABLE users ADD COLUMN identity_locked_at TEXT;
