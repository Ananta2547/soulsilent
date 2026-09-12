-- A user can carry more than one role. `role` stays the primary one every
-- existing check reads; `roles_json` holds the extra ones the admin ticks
-- (JSON string[], e.g. ["teacher","session_host"]).
ALTER TABLE users ADD COLUMN roles_json TEXT;
