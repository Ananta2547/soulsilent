-- Soulsilent + Allsoullearn Database Schema (Cloudflare D1/SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  google_id TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  subdistrict TEXT NOT NULL,
  details TEXT,
  map_url TEXT,
  car_parking INTEGER DEFAULT 0,
  motorcycle_parking INTEGER DEFAULT 0,
  internal_note TEXT,
  owner_id TEXT REFERENCES users(id),
  gallery_json TEXT DEFAULT '[]',
  graphic_map_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  instructor_id TEXT REFERENCES users(id),
  date TEXT NOT NULL,
  time_start TEXT NOT NULL,
  time_end TEXT NOT NULL,
  location TEXT,
  location_id TEXT REFERENCES locations(id),
  schedule_json TEXT DEFAULT '[]',
  learn_json TEXT DEFAULT '[]',
  category TEXT,
  tags_json TEXT DEFAULT '[]',
  promo_price REAL,
  promo_start TEXT,
  promo_end TEXT,
  map_url TEXT,
  theme_color TEXT,
  max_participants INTEGER DEFAULT 20,
  price REAL NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  workshop_id TEXT REFERENCES workshops(id),
  user_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  amount REAL NOT NULL,
  attended INTEGER,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  instructor_id TEXT REFERENCES users(id),
  price REAL NOT NULL,
  thumbnail_url TEXT,
  category TEXT,
  level TEXT DEFAULT 'beginner',
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id),
  title TEXT NOT NULL,
  description TEXT,
  video_key TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER DEFAULT 0,
  is_preview INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id),
  user_id TEXT REFERENCES users(id),
  payment_status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  amount REAL NOT NULL,
  progress_json TEXT DEFAULT '{}',
  enrolled_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'slow',
  tags_json TEXT DEFAULT '[]',
  title TEXT NOT NULL,
  excerpt TEXT,
  cover_swatch TEXT DEFAULT 'teal',
  cover_image_url TEXT,
  body_json TEXT DEFAULT '[]',
  author_id TEXT REFERENCES users(id),
  read_minutes INTEGER DEFAULT 5,
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops(status);
CREATE INDEX IF NOT EXISTS idx_workshops_date ON workshops(date);
CREATE INDEX IF NOT EXISTS idx_workshops_location ON workshops(location_id);
CREATE INDEX IF NOT EXISTS idx_workshops_category ON workshops(category);
CREATE INDEX IF NOT EXISTS idx_workshops_instructor ON workshops(instructor_id);
CREATE INDEX IF NOT EXISTS idx_locations_province ON locations(province);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_workshop ON bookings(workshop_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
