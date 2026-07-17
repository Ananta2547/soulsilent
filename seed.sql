-- Seed data: admin user + sample workshops + sample course

-- Admin user (password: admin1234)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES
  ('admin-001', 'admin@soulsilent.test', '$2b$10$aD06wHPDwAoKZIgt2JLN8Onad9GGx3gFtwFMBa5A77KE3Ddl0n.UW', 'Admin', 'admin'),
  ('teacher-001', 'teacher@soulsilent.test', '$2b$10$aD06wHPDwAoKZIgt2JLN8Onad9GGx3gFtwFMBa5A77KE3Ddl0n.UW', 'อาจารย์โสภณ', 'teacher'),
  ('user-001', 'user@soulsilent.test', '$2b$10$aD06wHPDwAoKZIgt2JLN8Onad9GGx3gFtwFMBa5A77KE3Ddl0n.UW', 'ผู้เรียนทั่วไป', 'user');

-- Sample workshops
INSERT OR IGNORE INTO workshops (id, title, description, short_description, instructor_id, date, time_start, time_end, location, max_participants, price, status) VALUES
  ('ws-001', 'Mindful Drawing Workshop', 'เวิร์กชอปการวาดภาพอย่างมีสติ ปลดล็อกความคิดสร้างสรรค์ภายใน เหมาะสำหรับมือใหม่และผู้ที่อยากผ่อนคลายผ่านศิลปะ', 'วาดภาพอย่างมีสติ ปลดล็อกความคิดสร้างสรรค์', 'teacher-001', '2026-06-15', '13:00', '17:00', 'soulsilent studio, ทองหล่อ', 15, 1200, 'active'),
  ('ws-002', 'Sound Healing Journey', 'การเดินทางสู่ภายในด้วยเสียงบำบัด ใช้โบว์ลทิเบตและเครื่องดนตรีธรรมชาติ', 'เสียงบำบัดเพื่อความสงบภายใน', 'teacher-001', '2026-06-22', '09:30', '12:00', 'soulsilent studio, ทองหล่อ', 20, 800, 'active'),
  ('ws-003', 'Slow Living: Pottery Basics', 'เวิร์กชอปปั้นเซรามิกแบบ slow living ใช้เวลา 1 วันเต็มกับดินและล้อปั้น', 'ปั้นเซรามิกแบบ slow living', 'teacher-001', '2026-07-05', '10:00', '17:00', 'soulsilent studio, ทองหล่อ', 12, 2500, 'active');

-- Sample course
INSERT OR IGNORE INTO courses (id, title, description, short_description, instructor_id, price, category, level, status) VALUES
  ('course-001', 'Introduction to Mindful Photography', 'เรียนรู้การถ่ายภาพอย่างมีสติ ผ่านบทเรียนวิดีโอ 12 ตอน ครอบคลุมตั้งแต่พื้นฐานกล้องจนถึงการสื่อสารผ่านภาพ', 'ถ่ายภาพอย่างมีสติ — คอร์สออนไลน์ 12 บทเรียน', 'teacher-001', 1990, 'Photography', 'beginner', 'published'),
  ('course-002', 'Watercolor for Beginners', 'คอร์สวาดสีน้ำสำหรับมือใหม่ เริ่มจากศูนย์จนวาดได้จริง', 'วาดสีน้ำตั้งแต่พื้นฐาน', 'teacher-001', 1490, 'Art', 'beginner', 'published');

-- Sample lessons
INSERT OR IGNORE INTO lessons (id, course_id, title, description, sort_order, is_preview) VALUES
  ('lesson-001', 'course-001', 'บทที่ 1: รู้จักกล้องของคุณ', 'ทำความเข้าใจส่วนประกอบและการตั้งค่าพื้นฐาน', 1, 1),
  ('lesson-002', 'course-001', 'บทที่ 2: สามเหลี่ยมการเปิดรับแสง', 'Aperture, Shutter, ISO', 2, 0),
  ('lesson-003', 'course-001', 'บทที่ 3: การจัดองค์ประกอบภาพ', 'Rule of thirds และเทคนิคพื้นฐาน', 3, 0),
  ('lesson-004', 'course-002', 'บทที่ 1: รู้จักอุปกรณ์สีน้ำ', 'พู่กัน กระดาษ และสีที่ควรมี', 1, 1),
  ('lesson-005', 'course-002', 'บทที่ 2: เทคนิคพื้นฐาน Wet-on-wet', 'การลงสีบนกระดาษเปียก', 2, 0);
