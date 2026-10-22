'use client';

/* What a printed coupon's QR opens: the coupon's face, and a button that puts
 * it into "คูปองของฉัน" (signing in first if needed). */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { PageLoader } from '@/components/design/PageLoader';
import { CouponTicket, untilLabel } from '@/components/coupons/CouponTicket';

type Info = {
  coupon: { name: string; description: string | null; headline: string; big: string; ends_at: string | null; active: boolean };
  code: string;
  isPublic: boolean;
  taken: boolean;
  mine: boolean;
  signedIn: boolean;
};

export default function ClaimCouponPage() {
  const { code } = useParams<{ code: string }>();
  const { lang } = useLang();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/coupons/claim?code=${encodeURIComponent(code)}`);
        if (!res.ok) {
          setMissing(true);
          return;
        }
        setInfo((await res.json()) as Info);
      } catch {
        setMissing(true);
      }
    })();
  }, [code]);

  async function claim() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) setErr(d.error || tr(lang, 'เก็บคูปองไม่สำเร็จ', 'Could not keep the coupon'));
      else setDone(true);
    } catch {
      setErr(tr(lang, 'เชื่อมต่อไม่สำเร็จ', 'Connection failed'));
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="cpw-page">
        <div className="container cpw-claim">
          <span className="eyebrow">{tr(lang, 'คูปอง', 'Coupon')}</span>
          <h1 className="display-th" style={{ fontSize: 32, margin: '14px 0 10px' }}>{tr(lang, 'ไม่พบคูปองนี้', 'Coupon not found')}</h1>
          <p style={{ color: 'var(--muted)' }}>{tr(lang, 'รหัสอาจพิมพ์ผิด หรือคูปองถูกยกเลิกแล้ว', 'The code may be mistyped, or the coupon was withdrawn.')}</p>
          <Btn kind="ink" href="/journeys">{tr(lang, 'ดูกิจกรรม', 'See journeys')} →</Btn>
        </div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="cpw-page" style={{ display: 'flex', justifyContent: 'center' }}>
        <PageLoader />
      </div>
    );
  }

  const c = info.coupon;
  const kept = done || info.mine;
  return (
    <div className="cpw-page">
      <div className="container cpw-claim">
        <span className="eyebrow">{tr(lang, 'คุณได้รับคูปอง', 'A coupon for you')}</span>
        <CouponTicket big={c.big} name={c.name} line={c.headline} meta={untilLabel(c.ends_at) || c.description} code={info.code} tone={c.big === 'ฟรี' ? 'accent' : 'teal'} off={!c.active || info.taken} size="big" />
        {err && <p className="cpw-note is-bad">{err}</p>}
        {!c.active ? (
          <p style={{ color: 'var(--muted)' }}>{tr(lang, 'คูปองนี้ถูกปิดใช้งานแล้ว', 'This coupon is no longer active')}</p>
        ) : info.taken ? (
          <p style={{ color: 'var(--muted)' }}>{tr(lang, 'คูปองใบนี้มีคนเก็บไปแล้ว', 'Someone already kept this coupon')}</p>
        ) : info.isPublic ? (
          <>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>{tr(lang, `กรอกรหัส ${info.code} ในหน้าสรุปยอดก่อนชำระเงินได้เลย`, `Type ${info.code} on the summary screen before paying`)}</p>
            <Btn kind="teal" href="/journeys">{tr(lang, 'เลือกกิจกรรม', 'Pick a journey')} →</Btn>
          </>
        ) : kept ? (
          <>
            <p style={{ color: '#0b6b4f', fontWeight: 600 }}>{tr(lang, 'เก็บเข้า “คูปองของฉัน” แล้ว', 'Kept in “My coupons”')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/me/coupons" className="btn btn-paper">{tr(lang, 'คูปองของฉัน', 'My coupons')}</Link>
              <Btn kind="teal" href="/journeys">{tr(lang, 'เลือกกิจกรรม', 'Pick a journey')} →</Btn>
            </div>
          </>
        ) : info.signedIn ? (
          <Btn kind="teal" onClick={claim} disabled={busy}>{busy ? tr(lang, 'กำลังเก็บ…', 'Keeping…') : tr(lang, 'เก็บเข้าคูปองของฉัน', 'Keep this coupon')}</Btn>
        ) : (
          <>
            <p style={{ color: 'var(--muted)' }}>{tr(lang, 'เข้าสู่ระบบก่อน แล้วกดเก็บคูปองไว้ในบัญชี', 'Sign in, then keep the coupon in your account')}</p>
            <Btn kind="teal" href={`/auth/login?redirect=${encodeURIComponent(`/coupon/${info.code}`)}`}>{tr(lang, 'เข้าสู่ระบบเพื่อเก็บคูปอง', 'Sign in to keep it')}</Btn>
          </>
        )}
      </div>
    </div>
  );
}
