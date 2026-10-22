'use client';

/* The checkout screen ("หน้า checkout รวม"): everything the member is about
 * to pay — the price, promo, coupon and total — with the coupons they can
 * pick and a box to type a code. It comes after the application popup's
 * "ถัดไป", for bookings, gifts and selected applicants alike. The numbers
 * come from POST /api/coupons/quote; the booking routes check the coupon
 * again when the booking is made. */
import { useCallback, useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { CouponTicket, toneFor, untilLabel } from '@/components/coupons/CouponTicket';
import '@/components/coupons/coupons.css';

export type CheckoutRequest = {
  workshop_id?: string;
  booking_id?: string;
  tier_id?: string | null;
  group_size?: number | null;
  gift?: boolean;
};

type Quote = { list: number; promoOff: number; couponOff: number; total: number };
type Offer = {
  code: string;
  name: string;
  headline: string;
  big: string;
  kind: string;
  endsAt: string | null;
  source: 'wallet' | 'public';
  ok: boolean;
  reason: string | null;
  total: number | null;
};
type QuoteRes = {
  quote?: Quote;
  applied?: { code: string; name: string } | null;
  codeError?: string | null;
  offers?: Offer[];
  flow?: string;
  error?: string;
};

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

export function CheckoutModal({
  request,
  title,
  subtitle,
  itemLabel,
  confirmLabel,
  busy,
  error,
  onBack,
  backLabel,
  onClose,
  onConfirm,
}: {
  request: CheckoutRequest;
  /** e.g. the journey title. */
  title: string;
  subtitle?: string;
  /** What is bought, e.g. "1 ที่นั่ง" or "แพ็ก 3 คน". */
  itemLabel: string;
  confirmLabel?: string;
  busy: boolean;
  error?: string | null;
  onBack?: () => void;
  backLabel?: string;
  onClose: () => void;
  /** Make the booking with this coupon code (or none). */
  onConfirm: (couponCode: string | null) => void;
}) {
  const { lang } = useLang();
  const [data, setData] = useState<QuoteRes | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ code: string; name: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reqKey = JSON.stringify(request);

  const ask = useCallback(
    async (code?: string | null): Promise<QuoteRes | null> => {
      try {
        const res = await fetch('/api/coupons/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(JSON.parse(reqKey) as CheckoutRequest), code: code || undefined }),
        });
        const d = (await res.json()) as QuoteRes;
        if (!res.ok) {
          setLoadErr(d.error || tr(lang, 'โหลดยอดชำระไม่สำเร็จ', 'Could not load the total'));
          return null;
        }
        return d;
      } catch {
        setLoadErr(tr(lang, 'เชื่อมต่อไม่สำเร็จ', 'Connection failed'));
        return null;
      }
    },
    [reqKey, lang],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      const d = await ask(null);
      if (live && d) setData(d);
    })();
    return () => {
      live = false;
    };
  }, [ask]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function use(code: string) {
    const c = code.trim();
    if (!c || checking) return;
    setChecking(true);
    setMsg(null);
    const d = await ask(c);
    setChecking(false);
    if (!d) return;
    if (d.applied) {
      setData(d);
      setApplied(d.applied);
      setTyped('');
      setMsg({ ok: true, text: tr(lang, `ใช้คูปอง “${d.applied.name}” แล้ว`, `Coupon “${d.applied.name}” applied`) });
    } else {
      // Keep whatever was applied before; just say why this one does not work.
      setMsg({ ok: false, text: d.codeError || tr(lang, 'ใช้คูปองนี้ไม่ได้', 'This coupon cannot be used') });
    }
  }

  async function remove() {
    setApplied(null);
    setMsg(null);
    const d = await ask(null);
    if (d) setData(d);
  }

  const q = data?.quote;
  const total = q?.total ?? 0;
  const offers = data?.offers || [];
  const deposit = data?.flow === 'deposit';

  return (
    <div className="co-shell" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="co-card pop-mitr" role="dialog" aria-modal="true" aria-labelledby="co-title">
        <div className="co-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="co-eyebrow">{tr(lang, 'สรุปยอด · ชำระเงิน', 'Summary · payment')}</div>
            <h2 id="co-title" className="co-title">{tr(lang, 'ตรวจยอดก่อนชำระเงิน', 'Check the total before paying')}</h2>
            <p className="co-sub">{[title, subtitle].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="co-close" onClick={onClose} disabled={busy} aria-label={tr(lang, 'ปิด', 'Close')}>×</button>
        </div>

        <div className="co-body">
          {(error || loadErr) && <div className="co-err">{error || loadErr}</div>}

          <section className="co-box">
            <div className="co-box-h">
              <span className="co-eyebrow">{tr(lang, 'รายการ', 'Items')}</span>
              {deposit && <span className="co-eyebrow" style={{ color: 'var(--muted)' }}>{tr(lang, 'มัดจำ', 'deposit')}</span>}
            </div>
            {!q ? (
              <div className="co-empty">{tr(lang, 'กำลังคำนวณยอด…', 'Working out the total…')}</div>
            ) : (
              <div className="co-lines">
                <div className="co-line">
                  <span>{itemLabel}</span>
                  <b>{baht(q.list)}</b>
                </div>
                {q.promoOff > 0 && (
                  <div className="co-line is-off">
                    <span>{tr(lang, 'ส่วนลดโปรโมชัน', 'Promotion')}</span>
                    <b>−{baht(q.promoOff)}</b>
                  </div>
                )}
                {applied && q.couponOff > 0 && (
                  <div className="co-line is-off">
                    <span>
                      {tr(lang, 'คูปอง', 'Coupon')}
                      <span className="co-chip">
                        {applied.code}
                        <button type="button" onClick={remove} aria-label={tr(lang, 'เอาคูปองออก', 'Remove coupon')} disabled={busy}>×</button>
                      </span>
                    </span>
                    <b>−{baht(q.couponOff)}</b>
                  </div>
                )}
                <div className="co-total">
                  <span className="co-eyebrow">{deposit ? tr(lang, 'มัดจำที่ต้องชำระ', 'Deposit due') : tr(lang, 'ยอดชำระสุทธิ', 'Total due')}</span>
                  <b>{total <= 0 ? tr(lang, 'ฟรี', 'Free') : baht(total)}</b>
                </div>
              </div>
            )}
          </section>

          <section className="co-box">
            <div className="co-box-h">
              <span className="co-eyebrow">{tr(lang, 'คูปอง', 'Coupons')}</span>
              {offers.length > 0 && <span className="co-eyebrow" style={{ color: 'var(--muted)' }}>{tr(lang, `${offers.filter((o) => o.ok).length} ใบใช้ได้`, `${offers.filter((o) => o.ok).length} usable`)}</span>}
            </div>
            {offers.length > 0 ? (
              <div className="co-offers">
                {offers.map((o) => {
                  const on = applied?.code === o.code;
                  return (
                    <CouponTicket
                      key={o.code}
                      big={o.big}
                      name={o.name}
                      line={o.headline}
                      meta={o.ok ? (o.total != null ? tr(lang, `เหลือจ่าย ${o.total <= 0 ? 'ฟรี' : baht(o.total)}`, `Pay ${o.total <= 0 ? 'nothing' : baht(o.total)}`) : untilLabel(o.endsAt)) : null}
                      why={o.ok ? null : o.reason}
                      tone={toneFor(o.kind)}
                      off={!o.ok || busy}
                      picked={on}
                      onClick={() => (on ? remove() : use(o.code))}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="co-empty">{tr(lang, 'ยังไม่มีคูปองในบัญชี — มีรหัสอยู่แล้วกรอกด้านล่างได้เลย', 'No coupons in your account — type a code below if you have one.')}</div>
            )}
            <form
              className="co-code"
              onSubmit={(e) => {
                e.preventDefault();
                use(typed);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={tr(lang, 'กรอกรหัสคูปอง', 'Coupon code')}
                aria-label={tr(lang, 'รหัสคูปอง', 'Coupon code')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
              />
              <button type="submit" disabled={!typed.trim() || checking || busy}>
                {checking ? '…' : tr(lang, 'ใช้', 'Apply')}
              </button>
            </form>
            {msg && <div className={`co-msg ${msg.ok ? 'is-ok' : 'is-bad'}`}>{msg.text}</div>}
          </section>
        </div>

        <div className="co-foot">
          {total > 0 && (
            <div className="co-warn">
              <span style={{ fontSize: 15, lineHeight: 1.3 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{tr(lang, 'หน้าถัดไปคือ QR ชำระเงิน — มีอายุ 10 นาที', 'Next is the payment QR — it lives 10 minutes')}</b>
                <span>
                  {tr(
                    lang,
                    'อย่าบันทึก QR ไว้จ่ายทีหลัง และอย่าสแกนซ้ำ — เงินจะถูกตัดแต่ระบบไม่รับชำระ และไม่ได้ที่นั่งเพิ่ม (ธนาคารคืนเงินภายหลัง)',
                    'Do not save the QR to pay later or scan it twice — the bank takes the money but we reject it, and no extra seat is granted (the bank refunds it later).',
                  )}
                </span>
              </div>
            </div>
          )}
          <div className="co-foot-row">
            {onBack && (
              <button type="button" className="co-back" onClick={onBack} disabled={busy}>
                ← {backLabel || tr(lang, 'ย้อนกลับ', 'Back')}
              </button>
            )}
            <div className="co-due">
              <div className="co-eyebrow">{deposit ? tr(lang, 'มัดจำ', 'Deposit') : tr(lang, 'ยอดชำระ', 'Amount due')}</div>
              <b>{q ? (total <= 0 ? tr(lang, 'ฟรี', 'Free') : baht(total)) : '—'}</b>
            </div>
            <button
              type="button"
              className="btn btn-teal"
              style={{ flex: '1 0 100%', justifyContent: 'center' }}
              disabled={busy || !q}
              onClick={() => onConfirm(applied?.code ?? null)}
            >
              {busy
                ? tr(lang, 'กำลังดำเนินการ…', 'Processing…')
                : confirmLabel || (total <= 0 ? tr(lang, 'ยืนยันการจอง (ไม่ต้องชำระเงิน)', 'Confirm (nothing to pay)') : tr(lang, 'ยืนยันและไปชำระเงิน', 'Confirm and pay'))}{' '}
              {!busy && <span className="mono">→</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
