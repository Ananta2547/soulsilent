/* Where a booking came from (migration 071). The visitor's landing is
 * captured in the browser — ?ref=<host link>, utm_* tags, or the outside site
 * that sent them — and kept for 30 days; the booking request carries it and
 * the server classifies it into one bucket for the Host Dashboard. */

export type Attribution = {
  link_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer_host?: string | null;
  /** ms since epoch when captured */
  at?: number;
};

export type Source = 'host_link' | 'asl_campaign' | 'social' | 'search' | 'asl_browse' | 'direct';

export const SOURCE_LABEL: Record<Source, string> = {
  host_link: 'ลิงก์ของคุณ',
  asl_campaign: 'แคมเปญ AllSoulLearn',
  social: 'โซเชียล',
  search: 'ค้นหา (Google ฯลฯ)',
  asl_browse: 'หน้ารวมบน AllSoulLearn',
  direct: 'เข้าตรง / ไม่ทราบ',
};

const KEY = 'asl_attr';
const VID = 'asl_vid';
const TTL = 30 * 24 * 3600 * 1000;
const SOCIAL = /(facebook|fb\.|instagram|line\.me|lin\.ee|tiktok|twitter|x\.com|t\.co|youtube|threads|pinterest|lemon8)/i;
const SEARCH = /(google\.|bing\.|yahoo\.|duckduckgo|baidu|yandex)/i;

const clean = (v: unknown, max = 80) => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return s && /^[\w\-.:/ ]+$/u.test(s) ? s : null;
};

/** Browser: random id for counting unique visitors. No account, no IP. */
export function visitorId(): string | null {
  try {
    let v = localStorage.getItem(VID);
    if (!v || !/^[0-9a-f-]{36}$/.test(v)) {
      v = crypto.randomUUID();
      localStorage.setItem(VID, v);
    }
    return v;
  } catch {
    return null;
  }
}

/** Browser: remember how this visit arrived. A tagged landing (ref/utm)
 *  replaces what was stored; an outside referrer only fills an empty slot,
 *  so moving around the site never overwrites the real source. */
export function captureAttribution(url: URL, referrer: string): void {
  try {
    const p = url.searchParams;
    const tagged: Attribution = {
      link_id: clean(p.get('ref'), 24),
      utm_source: clean(p.get('utm_source')),
      utm_medium: clean(p.get('utm_medium')),
      utm_campaign: clean(p.get('utm_campaign')),
    };
    let refHost: string | null = null;
    try {
      const r = referrer ? new URL(referrer) : null;
      if (r && r.host !== url.host) refHost = r.host.slice(0, 80);
    } catch {}
    const stored = readAttribution();
    if (tagged.link_id || tagged.utm_source || tagged.utm_campaign) {
      localStorage.setItem(KEY, JSON.stringify({ ...tagged, referrer_host: refHost, at: Date.now() }));
    } else if (refHost && !stored) {
      localStorage.setItem(KEY, JSON.stringify({ referrer_host: refHost, at: Date.now() }));
    }
  } catch {}
}

/** Browser: the stored landing, if not expired. */
export function readAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    if (!a.at || Date.now() - a.at > TTL) {
      localStorage.removeItem(KEY);
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

/** Server: one bucket per booking. No stored landing but a booking made on
 *  the site means the visitor found it by browsing AllSoulLearn. */
export function classify(a: Attribution | null, hasLink: boolean): Source {
  if (hasLink) return 'host_link';
  if (!a) return 'asl_browse';
  const src = `${a.utm_source || ''} ${a.utm_medium || ''}`;
  if (/allsoullearn|asl/i.test(a.utm_source || '') || /asl/i.test(a.utm_campaign || '')) return 'asl_campaign';
  if (SOCIAL.test(src) || SOCIAL.test(a.referrer_host || '') || /social/i.test(a.utm_medium || '')) return 'social';
  if (SEARCH.test(src) || SEARCH.test(a.referrer_host || '') || /cpc|organic/i.test(a.utm_medium || '')) return 'search';
  if (a.utm_source || a.referrer_host) return 'direct';
  return 'asl_browse';
}

/** Server: store where a booking came from. Only fills an empty row, so a
 *  re-used pending hold keeps its first source. Never throws — a booking
 *  must not fail over analytics. */
export async function saveAttribution(db: D1Database, bookingId: string, raw: unknown): Promise<void> {
  try {
    const a = raw && typeof raw === 'object' ? (raw as Attribution) : null;
    const linkId = clean(a?.link_id, 24);
    const link = linkId
      ? await db.prepare('SELECT id FROM host_links WHERE id = ? AND active = 1').bind(linkId).first<{ id: string }>()
      : null;
    await db
      .prepare(
        `UPDATE bookings SET source = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, link_id = ?, referrer_host = ?
          WHERE id = ? AND source IS NULL`,
      )
      .bind(
        classify(a, !!link),
        clean(a?.utm_source),
        clean(a?.utm_medium),
        clean(a?.utm_campaign),
        link?.id ?? null,
        clean(a?.referrer_host),
        bookingId,
      )
      .run();
  } catch (e) {
    console.error('[attribution] save failed', bookingId, e);
  }
}
