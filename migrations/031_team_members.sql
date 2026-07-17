-- Admin-curated "team" shown on the About page. Any user (user or admin) can be
-- flagged as a team member. Seed with existing admins so the current About page
-- display is preserved; admins can then add/remove anyone.
ALTER TABLE users ADD COLUMN is_team INTEGER DEFAULT 0;
UPDATE users SET is_team = 1 WHERE role = 'admin';
