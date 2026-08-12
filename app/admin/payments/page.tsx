'use client';

import { PageLoader } from '@/components/design/PageLoader';
import { useEffect, useState } from 'react';

interface Orphan {
  id: string;
  payment_intent: string | null;
  booking_id: string | null;
  amount: number;
  currency: string;
  email: string | null;
  reason: string;
  resolved: number;
  resolved_note: string | null;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  duplicate: 'จ่ายซ้ำ (ที่นั่งจ่ายแล้ว)',
  late_cancelled: 'จ่ายหลังหมดเวลา (booking ยกเลิก)',
  unknown: 'ไม่พบ booking',
};

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<Orphan[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function load(all: boolean) {
    fetch(`/api/admin/orphan-payments${all ? '?all=1' : ''}`)
      .then(async (r) => {
        const b = (await r.json()) as { items?: Orphan[]; error?: string };
        return r.ok && b.items ? b.items : [];
      })
      .then(setItems)
      .catch(() => setItems([]));
  }

  useEffect(() => {
    load(showAll);
  }, [showAll]);

  async function resolve(id: string, resolved: boolean) {
    setBusy(id);
    try {
      await fetch('/api/admin/orphan-payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved }),
      });
      load(showAll);
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return <PageLoader />;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">ตรวจเงินเข้าผิดปกติ</h1>
      <p className="text-sm text-muted mb-4" style={{ color: 'var(--muted)' }}>
        เงินที่เข้า Stripe แต่ไม่ตรงกับการจองที่ต้องจ่าย — จ่าย QR หลังหมดเวลา หรือสแกน QR ซ้ำ
        เงินก้อนนี้ตกใน Stripe balance ต้อง<strong>คืนเงินเองที่ Stripe Dashboard</strong> แล้วกด &ldquo;จัดการแล้ว&rdquo;
      </p>

      <label className="inline-flex items-center gap-2 text-sm mb-4 cursor-pointer">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        แสดงที่จัดการแล้วด้วย
      </label>

      {items.length === 0 ? (
        <div className="rounded-xl border p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          ✓ ไม่มีเงินเข้าผิดปกติที่ต้องจัดการ
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-2"
              style={{ opacity: o.resolved ? 0.55 : 1 }}
            >
              <div>
                <div className="text-lg font-semibold">
                  {(o.amount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} {o.currency.toUpperCase()}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{o.created_at} UTC</div>
              </div>
              <div className="text-sm">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs"
                  style={{ background: '#fdecec', color: '#a13030' }}
                >
                  {REASON_LABEL[o.reason] || o.reason}
                </span>
                <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {o.email || '—'}
                  {o.booking_id && <> · booking {o.booking_id.slice(0, 8)}</>}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {o.payment_intent && (
                  <a
                    href={`https://dashboard.stripe.com/payments/${o.payment_intent}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline"
                  >
                    เปิดใน Stripe ↗
                  </a>
                )}
                {o.resolved ? (
                  <button
                    className="btn btn-paper btn-sm"
                    disabled={busy === o.id}
                    onClick={() => resolve(o.id, false)}
                  >
                    กลับเป็นค้าง
                  </button>
                ) : (
                  <button
                    className="btn btn-teal btn-sm"
                    disabled={busy === o.id}
                    onClick={() => resolve(o.id, true)}
                  >
                    {busy === o.id ? '…' : 'จัดการแล้ว'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs mt-6" style={{ color: 'var(--muted)' }}>
        หมายเหตุ: PromptPay refund ต้องให้ผู้จ่ายกรอกเลขบัญชี — Stripe จะอีเมลไปขอ เงินคืนใน 1–2 วัน
      </p>
    </div>
  );
}
