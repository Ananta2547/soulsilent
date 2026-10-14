import { getDB, getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/bookings/[id]/calendar — the member's booked round as an .ics file,
 * so "เพิ่มลงปฏิทิน" opens the phone's calendar (iPhone shows its Add Event
 * sheet; Android/desktop download the file). Only the member's own booking,
 * and only one that holds a seat. Read-only.
 *
 * Times are Thai local (UTC+7, no daylight saving) converted to UTC.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10-15" + "10:00" Thai time → "20261015T030000Z". */
function utcStamp(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = (hm || '00:00').split(':').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh - 7, mm || 0));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
}
/** RFC 5545 text escaping + line folding (by characters, well under 75 octets for Thai). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 20) out.push((i ? ' ' : '') + line.slice(i, i + 20));
  return out.join('\r\n');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return new Response('กรุณาเข้าสู่ระบบ', { status: 401 });
  const db = await getDB();
  const row = await db
    .prepare(
      `SELECT b.id, b.workshop_id, w.title, w.date, w.end_date, w.time_start, w.time_end, w.is_online,
              l.name AS loc_name, l.address_detail AS loc_address, l.province AS loc_province
         FROM bookings b
         JOIN workshops w ON w.id = b.workshop_id
         LEFT JOIN locations l ON l.id = w.location_id
        WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'`,
    )
    .bind(id, me.sub)
    .first<{ id: string; workshop_id: string; title: string; date: string; end_date: string | null; time_start: string | null; time_end: string | null; is_online: number; loc_name: string | null; loc_address: string | null; loc_province: string | null }>()
    .catch(() => null);
  if (!row || !row.date) return new Response('ไม่พบการจอง', { status: 404 });

  const env = await getEnv();
  const site = env.SITE_URL || 'https://allsoullearn.com';
  const url = `${site}/journeys/${row.workshop_id}`;
  const where = row.is_online ? 'Online' : [row.loc_name, row.loc_address, row.loc_province].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AllSoulLearn//Bookings//TH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${row.id}@allsoullearn.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${utcStamp(row.date, row.time_start || '09:00')}`,
    `DTEND:${utcStamp(row.end_date || row.date, row.time_end || row.time_start || '10:00')}`,
    fold(`SUMMARY:${esc(row.title)}`),
    ...(where ? [fold(`LOCATION:${esc(where)}`)] : []),
    fold(`DESCRIPTION:${esc(`การจองของคุณบน AllSoulLearn\n${url}`)}`),
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    fold(`DESCRIPTION:${esc(row.title)}`),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="allsoullearn-${row.id.slice(0, 8)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
