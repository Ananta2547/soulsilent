'use client';

import { PageLoader } from '@/components/design/PageLoader';
import { useEffect, useState } from 'react';
import { AdminHead, AdminChips, Badge, adminToast } from '@/components/admin/AdminShell';
import { RecordTransferSheet } from '@/components/admin/ledger/RecordTransferSheet';

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

interface Refund {
  id: string;
  workshop_id: string;
  amount: number;
  cancel_reason: string;
  name: string;
  user_email: string | null;
  user_phone: string | null;
  workshop_title: string;
  workshop_date: string;
  workshop_time: string;
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
  // Seats in cancelled rounds (or moved seats whose member asked for the
  // refund) still waiting for admin to transfer the money and record it.
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [refundFor, setRefundFor] = useState<Refund | null>(null);

  function loadRefunds() {
    fetch('/api/admin/refunds')
      .then(async (r) => ((await r.json()) as { items?: Refund[] }).items || [])
      .then(setRefunds)
      .catch(() => setRefunds([]));
  }
  useEffect(loadRefunds, []);

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
    <>
      <AdminHead
        eyebrow="admin · payments"
        title="ตรวจเงินเข้า"
        sub="เงินที่เข้า Beam แต่ไม่ตรงกับการจองที่ต้องจ่าย — จ่าย QR หลังหมดเวลา หรือจ่ายซ้ำ"
      />

      {refunds && refunds.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="adm-card-head" style={{ padding: '0 2px 12px' }}>
            <h3 className="adm-h">รอคืนเงินให้ผู้จอง</h3>
            <span className="adm-meta">
              {refunds.length} รายการ · ฿{refunds.reduce((a, r) => a + r.amount, 0).toLocaleString()}
            </span>
          </div>
          <div className="adm-notice" style={{ marginBottom: 12 }}>
            รอบที่ถูกยกเลิก (รวมที่ผู้จัดยกเลิกเอง) และคนที่ถูกย้ายรอบแต่ขอคืนเงินแทน — โอนคืนตามยอดที่จ่ายจริง แล้วกด &ldquo;บันทึกการโอนคืน&rdquo;
            พร้อมเลขอ้างอิงจากแอปธนาคาร รายการจะหายไปเอง และผู้จองได้อีเมลพร้อมใบสำคัญจ่าย
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {refunds.map((r) => (
              <article key={r.id} className="adm-card adm-orphan">
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div className="adm-orphan-amount">฿{r.amount.toLocaleString()}</div>
                  <div className="adm-meta" style={{ fontSize: 12, marginTop: 4 }}>
                    {r.workshop_date} {r.workshop_time}
                  </div>
                </div>
                <div style={{ flex: '2 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <Badge tone={r.cancel_reason === 'refund_requested' ? 'warn' : 'bad'}>
                    {r.cancel_reason === 'refund_requested' ? 'ย้ายรอบแล้วขอคืนเงิน' : 'รอบถูกยกเลิก'}
                  </Badge>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="adm-meta" style={{ wordBreak: 'break-all' }}>
                    {[r.user_email, r.user_phone].filter(Boolean).join(' · ') || '—'} · {r.workshop_title}
                  </div>
                </div>
                <button type="button" className="adm-btn teal" onClick={() => setRefundFor(r)}>
                  บันทึกการโอนคืน
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {refundFor && (
        <RecordTransferSheet
          lockKind
          preset={{
            kind: 'refund',
            booking_id: refundFor.id,
            gross: refundFor.amount,
            payee_name: refundFor.name,
            payee_email: refundFor.user_email,
            description: `คืนเงิน · ${refundFor.workshop_title}`,
          }}
          onClose={() => setRefundFor(null)}
          onSaved={(tx, emailed) => {
            setRefundFor(null);
            adminToast(`บันทึก ${tx.doc_no} แล้ว${emailed ? ' · ส่งอีเมลแล้ว' : ''}`);
            loadRefunds();
          }}
        />
      )}

      <div className="adm-notice">
        ระบบ<b>คืนเงินอัตโนมัติ</b>ให้รายการที่จ่าย QR หลังหมดเวลาหรือจ่ายซ้ำแล้ว — ที่ค้างในนี้คือรายการที่คืนอัตโนมัติไม่สำเร็จ
        หรือผูกกับการจองไม่ได้ ให้คืนเองที่ Beam Dashboard แล้วกด &ldquo;จัดการแล้ว&rdquo; · PromptPay คืนเงินตามรอบธนาคาร ปกติ 1–3 วันทำการ
      </div>

      <div className="adm-toolbar">
        <AdminChips
          value={showAll ? 'all' : 'open'}
          onChange={(k) => setShowAll(k === 'all')}
          items={[
            { key: 'open', label: 'ค้างอยู่' },
            { key: 'all', label: 'รวมที่จัดการแล้ว' },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <div className="adm-card adm-empty">ไม่มีรายการค้าง ✺</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((o) => (
            <article key={o.id} className="adm-card adm-orphan" style={{ opacity: o.resolved ? 0.55 : 1 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div className="adm-orphan-amount">
                  {(o.amount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} {o.currency.toUpperCase()}
                </div>
                <div className="adm-meta" style={{ fontSize: 12, marginTop: 4 }}>
                  {o.created_at} UTC
                </div>
              </div>
              <div style={{ flex: '2 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <Badge tone="bad">{REASON_LABEL[o.reason] || o.reason}</Badge>
                <div className="adm-meta" style={{ wordBreak: 'break-all' }}>
                  {o.email || '—'}
                  {o.booking_id && <> · booking {o.booking_id.slice(0, 8)}</>}
                </div>
                {/* The charge id is what a refund is issued against, and what
                    to search for in Beam. Beam has no per-charge URL to link
                    to, so it is shown to be copied rather than clicked. */}
                <code className="adm-mono adm-meta" style={{ fontSize: 11.5 }}>
                  {o.id}
                </code>
              </div>
              {o.resolved ? (
                <button className="adm-btn" disabled={busy === o.id} onClick={() => resolve(o.id, false)}>
                  กลับเป็นค้าง
                </button>
              ) : (
                <button className="adm-btn teal" disabled={busy === o.id} onClick={() => resolve(o.id, true)}>
                  {busy === o.id ? '…' : 'จัดการแล้ว'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
