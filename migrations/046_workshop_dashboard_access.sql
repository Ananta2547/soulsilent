-- Per-workshop teacher-dashboard access for co-facilitators.
--
-- JSON array of users.id. Holds ONLY the co-facilitators an admin ticked; the
-- owning teacher (instructor_id, always instructor_ids_json[0]) has access
-- implicitly and is never stored here, so the two cannot drift apart.
--
-- NULL / '[]' = only the owner can open the dashboard, which is exactly how
-- every workshop behaved before this migration.
ALTER TABLE workshops ADD COLUMN dashboard_access_json TEXT;
