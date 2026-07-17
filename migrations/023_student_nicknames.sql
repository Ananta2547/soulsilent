-- Migration 023: teacher-assigned nicknames for students.
-- Keyed by (teacher_id = workshop owner, student_id) so the nickname follows the
-- student across any future booking in that teacher's workshops.
CREATE TABLE IF NOT EXISTS student_nicknames (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  nickname TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (teacher_id, student_id)
);
