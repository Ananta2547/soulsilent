import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { GP_START_MS, gpOfBooking, loadGp, rateFor, type GpBooking, type GpKind, type GpWorkshop } from '@/lib/gp';

const MONTH = /^\d{4}-\d{2}$/;
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const thaiStart = (ym: string) => Date.parse(`${ym}-01T00:00:00+07:00`);
const sqlUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/** GET /api/admin/gp?month=YYYY-MM — every host's GP for one Thai month:
 *  last month's sales and the rate they set per type, the
 *  round 0% period, this month's sales and the GP charged on them. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sp = new URL(request.url).searchParams;
    const month = sp.get('month') || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    if (!MONTH.test(month)) return NextResponse.json({ error: 'เดือนไม่ถูกต้อง' }, { status: 400 });
    const db = await getDB();
    const hosts =
      (
        await db
          .prepare(
            `SELECT u.id, COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS name, u.email
               FROM users u WHERE u.id IN (SELECT DISTINCT instructor_id FROM workshops WHERE instructor_id IS NOT NULL)
              ORDER BY name`,
          )
          .all<{ id: string; name: string; email: string }>()
      ).results || [];
    const ctx = await loadGp(db, hosts.map((h) => h.id));
    // Bookings paid in the month, with what GP needs about their round.
    const rows =
      (
        await db
          .prepare(
            `SELECT b.id, b.amount, b.host_credit, b.paid_at, b.status, b.payment_status, b.group_size, b.booking_kind, b.parent_booking_id,
                    w.id AS w_id, w.instructor_id, m.kind AS master_kind, w.payment_type, w.max_participants, w.fee_mode,
                    w.payout_deduction_type, w.payout_deduction_value
               FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN workshop_masters m ON m.id = w.master_id
              WHERE b.paid_at >= ? AND b.paid_at < ? AND b.status != 'cancelled'`,
          )
          .bind(sqlUtc(thaiStart(month)), sqlUtc(thaiStart(nextMonth(month))))
          .all<GpBooking & Omit<GpWorkshop, 'id'> & { w_id: string }>()
      ).results || [];
    const start = thaiStart(month);
    const items = hosts.map((h) => {
      const facts = ctx.hosts.get(h.id);
      let sales = 0, gp = 0, manualSales = 0;
      for (const r of rows.filter((x) => x.instructor_id === h.id)) {
        const g = (Number(r.amount) || 0) + (Number(r.host_credit) || 0);
        sales += g;
        if (r.fee_mode === 'manual') manualSales += g;
        else gp += gpOfBooking(ctx, { ...r, id: r.w_id }, r).gp;
      }
      const kind = (k: GpKind) => {
        const r = rateFor(ctx, h.id, k, start);
        return {
          prevSales: ctx.months.get(`${h.id}|${month}|${k}`)?.prevSales ?? ctx.sales.get(`${h.id}|${prevMonth(month)}|${k}`) ?? 0,
          table: r.table,
          rate: r.rate,
          why: r.why,
          sales: ctx.sales.get(`${h.id}|${month}|${k}`) || 0,
        };
      };
      return {
        ...h,
        roundZeroUntil: facts?.roundZeroUntil && facts.roundZeroUntil > start ? new Date(facts.roundZeroUntil + 7 * 3600000).toISOString().slice(0, 10) : null,
        single: kind('single'),
        round: kind('round'),
        sales: Math.round(sales * 100) / 100,
        gp: Math.round(gp * 100) / 100,
        manualSales: Math.round(manualSales * 100) / 100,
      };
    });
    return NextResponse.json({
      month,
      started: thaiStart(nextMonth(month)) > GP_START_MS,
      items,
      totals: { sales: items.reduce((s, i) => s + i.sales, 0), gp: items.reduce((s, i) => s + i.gp, 0) },
    });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[admin/gp]', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
