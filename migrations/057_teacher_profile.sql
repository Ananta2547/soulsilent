-- What a teacher says about themselves on their public page, beyond the
-- short bio: years teaching, the one-line promise under their name, the
-- "what you take home" list and the belief quoted on the dark band. Kept as
-- one JSON blob (see lib/teacher-profile.ts for the shape) because the
-- teacher edits it in place on the page and every field is optional.
ALTER TABLE users ADD COLUMN teacher_profile_json TEXT;
