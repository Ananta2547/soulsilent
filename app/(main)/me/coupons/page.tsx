'use client';

/* "คูปองของฉัน": the coupons in the member's account — granted by the team or
 * kept from a scanned card — with what each gives and until when. A code can
 * be added here too. Coupons are used on the checkout screen. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { PageLoader } from '@/components/design/PageLoader';
import { CouponTicket, toneFor, untilLabel } from '@/components/coupons/CouponTicket';

type Row = {
  code: string;
  name: string;
  description: string | null;
  headline: string;
  big: string;
  kind: string;
  ends_at: string | null;
  min_spend: number;
  used_on: string | null;
  state: 'ready' | 'used' | 'expired';
};

type Tab = 'ready' | 'used' | 'expired';

export default function MyCouponsPage() {
  const { lang } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [tab, setTab] = useState<Tab>('ready');
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/coupons');
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      const d = (await res.json()) as { coupons?: Row[] };
      setRows(d.coupons || []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || adding) return;
    setAdding(true);
    setNote(null);
    try {
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = (await res.json()) as { ok?: boolean; isPublic?: boolean; error?: string };
      if (!res.ok) {
        setNote({ ok: false, text: d.error || tr(lang, 'เพิ่มคูปองไม่สำเร็จ', 'Could not add the coupon') });
      } else if (d.isPublic) {
        setNote({ ok: true, text: tr(lang, 'รหัสนี้ใช้ได้เลยตอนชำระเงิน — กรอกในช่อง “รหัสคูปอง”', 'Use this code at checkout — type it in the coupon box') });
        setCode('');
      } else {
        setNote({ ok: true, text: tr(lang, 'เก็บคูปองเข้าบัญชีแล้ว', 'Coupon added to your account') });
        setCode('');
        setTab('ready');
        load();
      }
    } catch {
      setNote({ ok: false, text: tr(lang, 'เชื่อมต่อไม่สำเร็จ', 'Connection failed') });
    } finally {
      setAdding(false);
    }
  }

  if (signedOut) {
    return (
      <div className="cpw-page">
        <div className="container cpw-claim">
          <h1 className="display-th" style={{ fontSize: 34 }}>{tr(lang, 'คูปองของฉัน', 'My coupons')}</h1>
          <p style={{ color: 'var(--muted)' }}>{tr(lang, 'เข้าสู่ระบบเพื่อดูคูปองของคุณ', 'Sign in to see your coupons')}</p>
          <Btn kind="teal" href="/auth/login?redirect=/me/coupons">{tr(lang, 'เข้าสู่ระบบ', 'Sign in')}</Btn>
        </div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="cpw-page" style={{ display: 'flex', justifyContent: 'center' }}>
        <PageLoader />
      </div>
    );
  }

  const count = (t: Tab) => rows.filter((r) => r.state === t).length;
  const shown = rows.filter((r) => r.state === tab);
  const TABS: { key: Tab; th: string; en: string }[] = [
    { key: 'ready', th: 'ใช้ได้', en: 'Usable' },
    { key: 'used', th: 'ใช้แล้ว', en: 'Used' },
    { key: 'expired', th: 'หมดอายุ', en: 'Expired' },
  ];

  return (
    <div className="cpw-page">
      <div className="container">
        <div className="cpw-head">
          <div>
            <span className="eyebrow">{tr(lang, 'กระเป๋าคูปอง', 'Coupon wallet')}</span>
            <h1 className="display-th">{tr(lang, 'คูปองของฉัน', 'My coupons')}</h1>
            <p>{tr(lang, 'เลือกใช้ได้ในหน้าสรุปยอดก่อนชำระเงิน', 'Pick one on the summary screen before you pay')}</p>
          </div>
          <form className="cpw-add" onSubmit={add}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(lang, 'มีรหัสคูปอง? กรอกที่นี่', 'Have a code? Enter it here')} aria-label={tr(lang, 'รหัสคูปอง', 'Coupon code')} autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn btn-ink btn-sm" disabled={!code.trim() || adding}>
              {adding ? '…' : tr(lang, 'เพิ่ม', 'Add')}
            </button>
          </form>
        </div>
        {note && <div className={`cpw-note ${note.ok ? 'is-ok' : 'is-bad'}`} style={{ marginTop: -10, marginBottom: 14 }}>{note.text}</div>}

        <div className="cpw-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`cpw-tab${tab === t.key ? ' is-on' : ''}`} onClick={() => setTab(t.key)}>
              {tr(lang, t.th, t.en)} · {count(t.key)}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="cpw-empty">
            <b>{tab === 'ready' ? '0%' : '—'}</b>
            {tab === 'ready' ? tr(lang, 'ยังไม่มีคูปองที่ใช้ได้', 'No usable coupons yet') : tr(lang, 'ไม่มีรายการ', 'Nothing here')}
            {tab === 'ready' && (
              <div style={{ marginTop: 16 }}>
                <Link href="/journeys" className="btn btn-teal btn-sm">{tr(lang, 'ดูกิจกรรมทั้งหมด', 'See all journeys')} →</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="cpw-grid">
            {shown.map((r) => (
              <CouponTicket
                key={r.code}
                big={r.big}
                name={r.name}
                line={r.headline}
                meta={
                  r.state === 'used'
                    ? tr(lang, `ใช้กับ ${r.used_on}`, `Used on ${r.used_on}`)
                    : r.state === 'expired'
                      ? tr(lang, 'หมดอายุแล้ว', 'Expired')
                      : [untilLabel(r.ends_at), r.min_spend > 0 ? `ขั้นต่ำ ฿${r.min_spend.toLocaleString()}` : null].filter(Boolean).join(' · ') || tr(lang, 'ไม่มีวันหมดอายุ', 'No expiry')
                }
                code={r.code}
                tone={toneFor(r.kind)}
                off={r.state !== 'ready'}
                size="big"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
