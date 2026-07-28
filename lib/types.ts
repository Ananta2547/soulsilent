export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  role: 'admin' | 'user' | 'teacher';
  google_id: string | null;
  avatar_url: string | null;
  avatar_meta: string | null;
  cover_image_url: string | null;
  cover_image_meta: string | null;
  nickname: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  bio: string | null;
  phone: string | null;
  email_verified: number; // 0/1
  /** Account lifecycle: 'active' | 'suspended' (admin) | 'pending_deletion' (self-delete). */
  account_status: 'active' | 'suspended' | 'pending_deletion';
  /** When the user self-deleted — starts the 30-day recovery window. */
  deleted_at: string | null;
  /** 1 = featured on the public About page "team" section (admin-curated). */
  is_team: number;
  /** Single-use nonce for the current password-reset link (null = none active). */
  reset_nonce: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  province: string;
  district: string;
  subdistrict: string;
  /** Free-text street address (house no., soi, road) the admin writes. */
  address_detail: string | null;
  details: string | null;
  map_url: string | null;
  car_parking: number;
  motorcycle_parking: number;
  internal_note: string | null;
  owner_id: string | null;
  /** JSON array of URLs. First item = "main image" shown on workshop cards. */
  gallery_json: string;
  graphic_map_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  time: string;
  detail: string;
}

/** Per-day operating hours for a multi_day / multi_part workshop. */
export interface DayTime {
  date: string; // YYYY-MM-DD
  time_start: string; // HH:MM (24h)
  time_end: string; // HH:MM (24h)
}

/** One admin-defined question on a workshop's pre-booking application form. */
export interface ApplicationQuestion {
  id: string;
  label: string;
  /** text/textarea = free input; select = dropdown (one); radio = choose one;
   *  checkbox = choose many. select/radio/checkbox use `options`. */
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  required: boolean;
  options?: string[]; // for select / radio / checkbox
}

/** A day's timeline. `schedule_json` stores ScheduleDay[] (new) but old rows
 *  may hold a flat ScheduleItem[] — use parseSchedule() to normalize. */
export interface ScheduleDay {
  label: string;
  items: ScheduleItem[];
}

/** Overview/master record — activity info shared across its sessions (rounds). */
export interface WorkshopMaster {
  id: string;
  title: string;
  description: string | null;
  /** Teacher user id of the organizer (dropdown of role='teacher'). */
  organizer: string | null;
  cover_image_url: string | null;
  cover_image_meta: string | null;
  /** JSON string[] — เหมาะกับใคร (target audience). */
  target_json: string;
  /** JSON string[] — ได้อะไรจากกิจกรรม (key takeaways). */
  takeaways_json: string;
  created_at: string;
  updated_at: string;
  /** Joined (not a column): the organizer teacher's display name. */
  organizer_name?: string | null;
}

export interface Workshop {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  instructor_id: string | null;
  /** Scheduling shape. Affects how date(s) are interpreted. */
  workshop_type: 'one_day' | 'multi_day' | 'multi_part';
  /** Canonical/first day (YYYY-MM-DD). Used everywhere for sorting & display. */
  date: string;
  /** End day for 'multi_day' ranges (YYYY-MM-DD), else null. */
  end_date: string | null;
  /** JSON array of YYYY-MM-DD for 'multi_part', else '[]'. */
  dates_json: string;
  time_start: string;
  time_end: string;
  /** JSON DayTime[] — per-day operating hours for multi_day / multi_part.
   *  null / '[]' for one_day (which uses time_start/time_end). */
  day_times_json: string | null;
  location: string | null;
  location_id: string | null;
  schedule_json: string;
  learn_json: string;
  /** JSON string[] — เหมาะกับใคร (target audience) for this session. */
  target_json: string;
  category: string | null;
  tags_json: string;
  promo_price: number | null;
  promo_start: string | null;
  promo_end: string | null;
  map_url: string | null;
  theme_color: string | null;
  max_participants: number;
  /** Minimum participant age in years. null = no minimum (open to all ages). */
  min_age: number | null;
  /** Maximum participant age in years. null = no maximum. */
  max_age: number | null;
  price: number;
  image_url: string | null;
  /** active = เปิดจอง (public), closed = ปิดรับ (public), draft = แบบร่าง (hidden).
   *  cancelled/completed are legacy values, treated as "closed" when displayed. */
  status: 'active' | 'closed' | 'cancelled' | 'completed' | 'draft';
  /** JSON array of ApplicationQuestion for the pre-booking form. */
  application_form: string;
  /** Admission + payment config (selection workflow). */
  admission_type: 'direct' | 'selection';
  payment_type: 'free' | 'deposit' | 'paid';
  deposit_amount: number;
  announce_at: string | null;
  confirm_main_by: string | null;
  confirm_waitlist_by: string | null;
  /** When 1, the booking form requires a PDPA photo/video consent choice. */
  require_consent: number;
  /** Google Drive link to the event photos (only used when require_consent).
   *  Shown on My Journey to users who attended/checked in. */
  photos_drive_url: string | null;
  /** Optional link to a WorkshopMaster (this row is a session/round of it). */
  master_id: string | null;
  /** Organizer payout config + status. */
  payout_deduction_type: 'none' | 'fixed' | 'percent';
  payout_deduction_value: number;
  payout_status: 'pending' | 'paid';
  payout_remark: string | null;
  payout_slip_url: string | null;
  payout_slip_meta: string | null;
  created_at: string;
  updated_at: string;
  /** 1 = starred by admin → featured in the homepage Hero fan (migration 035). */
  featured: number;
  /** Live count of non-cancelled bookings. Computed — only present when the
   *  workshops API is called with ?counts=1 (admin-only). */
  booking_count?: number;
  /** Joined from the linked location (GET /api/workshops). Used by cards to
   *  format "name-province, district". Null when no location_id. */
  loc_name?: string | null;
  loc_province?: string | null;
  loc_district?: string | null;
}

export interface Booking {
  id: string;
  workshop_id: string;
  user_id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'refunded';
  stripe_payment_id: string | null;
  amount: number;
  attended: number | null; // null=not marked, 1=attended, 0=no-show
  expires_at: string | null; // ISO datetime — null for legacy or paid rows
  /** Snapshot of the applicant's answers + profile at booking time (JSON). */
  application_json: string | null;
  /** Per-day check-in map JSON: {"0":1,"1":0} (dayIndex -> 1 present / 0 absent). */
  attendance_json: string | null;
  /** Selection workflow: admin decision + waitlist rank + user confirmation. */
  app_status: 'applied' | 'approved' | 'waitlisted' | 'rejected';
  waitlist_rank: number | null;
  confirmed_at: string | null;
  /** Deposit-refund slip attached by admin (image standard: url + crop meta). */
  refund_slip_url: string | null;
  refund_slip_meta: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  workshop_id: string;
  user_id: string;
  rating: number; // 1..5
  comment: string | null;
  /** 1 = admin-featured (ติดดาว) — shown in the homepage review slider. */
  featured: number;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  instructor_id: string | null;
  price: number;
  thumbnail_url: string | null;
  category: string | null;
  level: 'beginner' | 'intermediate' | 'advanced';
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_key: string | null;
  duration_seconds: number | null;
  sort_order: number;
  is_preview: number;
  created_at: string;
}

export interface Enrollment {
  id: string;
  course_id: string;
  user_id: string;
  payment_status: 'pending' | 'paid' | 'refunded';
  stripe_payment_id: string | null;
  amount: number;
  progress_json: string;
  enrolled_at: string;
}

/* ---------- Image crop metadata (shared by every uploader) ---------- */

/** Pixel-or-percent crop box (matches react-image-crop's Crop shape). */
export interface CropBox {
  unit: '%' | 'px';
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Persisted side-by-side with every cropped image URL. Lets the admin re-open
 * the cropper later with the original image + previous crop coords restored.
 *
 * Stored as JSON in `*_meta` TEXT columns. Helpers in `lib/image-meta.ts`.
 */
export interface ImageMeta {
  original_url: string;
  crop: CropBox;
  aspect?: number; // width / height of the primary crop bound
}

export interface ArticleCategory {
  key: string;
  th: string;
  en: string;
  sort_order: number;
  created_at: string;
}

export type ArticleSwatch = 'teal' | 'cream' | 'ink' | 'accent';

export type ArticleBlock =
  | { kind: 'h2' | 'h3' | 'p' | 'caption'; text: string }
  | { kind: 'quote'; text: string; by?: string }
  | { kind: 'image'; swatch?: ArticleSwatch; hint?: string; aspect?: string; url?: string };

export interface Article {
  id: string;
  slug: string;
  category: string; // 'slow' | 'diary' | 'howto' | 'conversation' | 'reflection' | 'field'
  tags_json: string;
  title: string;
  excerpt: string | null;
  cover_swatch: ArticleSwatch;
  cover_image_url: string | null;
  body_json: string;
  author_id: string | null;
  read_minutes: number;
  featured: number; // 0/1
  published: number; // 0/1
  date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

/* ---------- Portfolio Builder ---------- */

export type PortfolioBlockKind = 'text' | 'image' | 'button' | 'video' | 'shape';

/**
 * One free-form element on the portfolio canvas. Position + size are stored in
 * px relative to the canvas frame (fixed editor width). All visual props are
 * optional and only meaningful for certain kinds.
 */
export interface PortfolioBlock {
  id: string;
  kind: PortfolioBlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  // text / button
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  bg?: string;
  radius?: number;
  // image
  src?: string;
  // button / image / video link
  href?: string;
  // video (YouTube/Vimeo embed URL or direct)
  videoUrl?: string;
  // shape
  shape?: 'rect' | 'ellipse' | 'line';
  rotation?: number; // degrees
  opacity?: number; // 0..1
}

export interface Portfolio {
  id: string;
  user_id: string;
  title: string | null;
  bg_color: string;
  bg_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  blocks_json: string;
  /** New Canva-class builder document (nodes + meta) as JSON. Source of truth. */
  doc_json: string | null;
  published: number; // 0/1
  created_at: string;
  updated_at: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'teacher';
  iat: number;
  exp: number;
}
