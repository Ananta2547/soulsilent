import type { Workshop } from './types';
import { getWorkshopDays, hasWorkshopEnded } from './workshop-utils';

/** One workshop the user applied to / attended, as returned by /api/me/journey. */
export type JourneyItem = {
  booking_id: string;
  workshop_id: string;
  status: string; // booking status
  payment_status: string;
  app_status: string;
  attended: number | null;
  attendance_json: string | null;
  refund_slip_url: string | null;
  application_json: string | null;
  created_at: string;
  title: string;
  image_url: string | null;
  date: string;
  end_date: string | null;
  dates_json: string;
  workshop_type: string;
  time_start: string;
  time_end: string;
  day_times_json: string | null;
  master_id: string | null;
  require_consent: number;
  photos_drive_url: string | null;
  review_rating: number | null;
  review_comment: string | null;
  review_created_at?: string | null;
};

type DateShape = Pick<Workshop, 'workshop_type' | 'date' | 'end_date' | 'dates_json' | 'time_end'>;

/** Countdown-to-start vs finished. `daysLeft` counts whole days until day one. */
export function journeyStatus(it: JourneyItem, now: Date = new Date()): { done: boolean; daysLeft: number } {
  const shape: DateShape = {
    workshop_type: it.workshop_type as DateShape['workshop_type'],
    date: it.date,
    end_date: it.end_date,
    dates_json: it.dates_json,
    time_end: it.time_end,
  };
  const done = hasWorkshopEnded(shape, now);
  const days = getWorkshopDays(shape);
  const start = new Date(`${days[0] || it.date}T${it.time_start || '00:00'}:00`);
  const daysLeft = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 86400000));
  return { done, daysLeft };
}

/** DD/MM/YYYY (Gregorian, numeric). */
export function fmtJourneyDate(d: string): string {
  const [y, m, day] = (d || '').split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}
