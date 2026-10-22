'use client';

/* Printable coupon cards: two per row on A4, each with the value, the rules
 * in brief, the code and a QR that opens /coupon/<code>. Used cards are
 * left out. */
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { PageLoader } from '@/components/design/PageLoader';
import { AllSoulLearnLogo } from '@/components/layout/AllSoulLearnLogo';
import '@/components/coupons/coupons.css';
import { bigOf, headlineOf, periodOf, type CouponRow } from '../../_components/CouponForm';

type CodeRow = { code: string; batch: string | null; owner_user_id: string | null; used_booking: string | null };

function Cards() {
  const { id } = useParams<{ id: string }>();
  const batch = useSearchParams().get('batch');
  const [coupon, setCoupon] = useState<CouponRow | null>(null);
  const [cards, setCards] = useState<{ code: string; qr: string }[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/coupons/${id}`);
      if (!res.ok) return;
      const d = (await res.json()) as { coupon: CouponRow; codes: CodeRow[] };
      setCoupon(d.coupon);
      // A card already kept in someone's wallet is theirs; no point printing it.
      const list = d.codes.filter((c) => !c.used_booking && !c.owner_user_id && (!batch || c.batch === batch));
      const site = window.location.origin;
      const out = await Promise.all(
        list.map(async (c) => ({ code: c.code, qr: await QRCode.toDataURL(`${site}/coupon/${c.code}`, { width: 300, margin: 1, errorCorrectionLevel: 'M' }) })),
      );
      setCards(out);
    })();
  }, [id, batch]);

  if (!coupon || !cards) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  return (
    <>
      <div className="cpp-noprint adm-card pad" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{coupon.name}</b>
          <div className="adm-meta">{cards.length} ใบ{batch ? ` · ชุด ${batch}` : ''} · ไม่รวมใบที่มีคนเก็บหรือใช้แล้ว</div>
        </div>
        <button type="button" className="adm-btn teal" onClick={() => window.print()}>พิมพ์</button>
      </div>
      <div className="cpp-sheet">
        {cards.map((c) => (
          <div key={c.code} className="cpp-card">
            <div className="cpp-stub" style={coupon.kind === 'free' ? { background: 'var(--accent)', color: 'var(--ink)' } : undefined}>
              <b>{bigOf(coupon.kind, coupon.value)}</b>
              <small>{coupon.kind === 'free' ? 'free' : 'coupon'}</small>
            </div>
            <div className="cpp-body">
              <AllSoulLearnLogo height={13} />
              <div className="cpp-name">{coupon.name}</div>
              <div className="cpp-meta">{headlineOf(coupon)} · {periodOf(coupon)}</div>
              <div className="cpp-meta">สแกนเพื่อเก็บเข้า “คูปองของฉัน” หรือกรอกรหัสตอนชำระเงินที่ allsoullearn.com</div>
              <div className="cpp-code">{c.code}</div>
            </div>
            <div className="cpp-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.qr} alt={`QR ${c.code}`} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function PrintCoupons() {
  return (
    <Suspense fallback={null}>
      <Cards />
    </Suspense>
  );
}
