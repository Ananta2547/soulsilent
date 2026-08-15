-- Multiple facilitators per workshop.
--
-- `instructor_id` stays as-is and keeps meaning "the owning teacher": the
-- teacher dashboard, payout and student-nickname features all key off it, and
-- it is the FIRST entry of instructor_ids_json. The new column holds the full
-- ordered list (JSON array of users.id) shown to the public.
ALTER TABLE workshops ADD COLUMN instructor_ids_json TEXT;

-- Backfill existing rows so the list view matches what admins already picked.
UPDATE workshops
   SET instructor_ids_json = '["' || instructor_id || '"]'
 WHERE instructor_id IS NOT NULL
   AND TRIM(instructor_id) != ''
   AND instructor_ids_json IS NULL;
