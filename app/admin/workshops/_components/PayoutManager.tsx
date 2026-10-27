'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Workshop } from '@/lib/types';
import { computePayout } from '@/lib/workshop-utils';
import { AdmSelect } from '@/components/admin/pickers';
import { SheetSection, adminToast } from '@/components/admin/AdminShell';
import { RecordTransferSheet } from '@/components/admin/ledger/RecordTransferSheet';

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

type GpBreakdown = { gross: number; gpFee: number; kind: string; lines: { id: string; rate: number; gp: number; gross: number }[] };
type PayoutTx = { id: string; doc_no: string; net: number; occurred_at: string; ref_id: string | null; legacy: number; kind: string };

export function PayoutManager({
  workshop,
  onSuccess,
  onCancel,
}: {
  workshop: Workshop;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  // GP by the table is the default; "advanced" switches this round to
  // admin's own deduction (none / fixed / percent).
  const [manual, setManual] = useState(workshop.fee_mode === 'manual');
  const [dType, setDType] = useState<'none' | 'fixed' | 'percent'>(workshop.payout_deduction_type || 'none');
  const [dValue, setDValue] = useState<number>(workshop.payout_deduction_value || 0);
  const [status, setStatus] = useState<'pending' | 'paid'>(workshop.payout_status || 'pending');
  const [remark, setRemark] = useState(workshop.payout_remark || '');

  const [gp, setGp] = useState<GpBreakdown | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The host-payout transfers recorded in the ledger for this round.
  const [txs, setTxs] = useState<PayoutTx[] | null>(null);
  const [host, setHost] = useState<{ name: string | null; email: string | null } | null>(null);
  const [recording, setRecording] = useState(false);

  // Gross and the GP of every paid booking, worked out on the server (lib/gp).
  useEffect(() => {
    fetch(`/api/workshops/${workshop.id}/payout`)
      .then(async (r) => (await r.json()) as GpBreakdown)
      .then(setGp)
      .catch(() => setGp({ gross: 0, gpFee: 0, lines: [], kind: 'single' }));
  }, [workshop.id]);
  const gross = gp?.gross ?? null;
  const paidCount = gp?.lines.length ?? 0;

  const loadTxs = useCallback(() => {
    fetch(`/api/admin/ledger?workshop_id=${workshop.id}&kind=host_payout`)
      .then(async (r) => (await r.json()) as { items?: PayoutTx[]; host?: { name: string | null; email: string | null } | null })
      .then((d) => {
        setTxs(d.items || []);
        setHost(d.host || null);
      })
      .catch(() => setTxs([]));
  }, [workshop.id]);
  useEffect(() => {
    loadTxs();
  }, [loadTxs]);

  const { deduction, net } = useMemo(() => {
    if (manual) return computePayout(gross || 0, dType, dValue);
    const fee = gp?.gpFee || 0;
    return { deduction: fee, net: (gross || 0) - fee };
  }, [manual, gross, dType, dValue, gp]);
  const rates = [...new Set((gp?.lines || []).map((l) => l.rate))].sort((a, b) => a - b);
  const transferred = (txs || []).reduce((s, t) => s + t.net, 0);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workshops/${workshop.id}/payout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee_mode: manual ? 'manual' : 'gp', deduction_type: dType, deduction_value: dValue, status, remark }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSuccess();
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="adm-notice is-bad" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      <SheetSection n={1} title="สรุปยอด">
        <div className="adm-sum">
          <div>
            <div className="adm-label">รายรับรวม</div>
            <b>{gross == null ? '…' : baht(gross)}</b>
            <small>{paidCount} คนชำระแล้ว</small>
          </div>
          <div>
            <div className="adm-label">{manual ? 'หักค่าใช้จ่าย' : 'ค่าธรรมเนียม GP'}</div>
            <b style={{ color: '#c2410c' }}>− {baht(deduction)}</b>
          </div>
          <div className="is-net">
            <div className="adm-label" style={{ color: 'var(--teal-deep)' }}>
              ยอดโอนสุทธิ
            </div>
            <b style={{ color: 'var(--teal)' }}>{baht(net)}</b>
          </div>
        </div>
      </SheetSection>

      <SheetSection n={2} title="ค่าธรรมเนียม">
        {!manual && (
          <div className="adm-notice" style={{ margin: '0 0 12px' }}>
            GP ตามตารางค่าธรรมเนียม: <b>{baht(gp?.gpFee || 0)}</b>
            {gp?.kind === 'free'
              ? ' · กิจกรรมฟรี/มัดจำ ไม่มี GP'
              : rates.length
                ? ` · อัตรา ${rates.map((r) => `${r}%`).join(', ')} ตามวันที่ชำระของแต่ละการจอง`
                : ''}
            <div className="adm-meta" style={{ marginTop: 4 }}>
              ขั้นตามยอดขายเดือนก่อนของผู้จัด · ส่วนที่เกิน 3,000 บาทต่อที่นั่งคิด 3% · กิจกรรมที่จัดก่อน 1 ม.ค. 2570 = 0%
            </div>
          </div>
        )}
        <label className="adm-check" style={{ padding: '6px 0' }}>
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          <span>ตั้งค่าขั้นสูง — ใช้ยอดหักเองแทน GP (ไม่หัก / บาท / เปอร์เซ็นต์)</span>
        </label>
        {manual && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <AdmSelect value={dType} onChange={(e) => setDType(e.target.value as typeof dType)} aria-label="รูปแบบการหัก">
                <option value="none">ไม่หัก</option>
                <option value="fixed">จำนวนเงินคงที่ (บาท)</option>
                <option value="percent">เปอร์เซ็นต์ (%)</option>
              </AdmSelect>
            </div>
            {dType !== 'none' && (
              <input
                type="number"
                min="0"
                value={dValue}
                onChange={(e) => setDValue(Number(e.target.value))}
                style={{ flex: '0 1 160px', width: 160 }}
                aria-label={dType === 'percent' ? 'เปอร์เซ็นต์' : 'จำนวนเงิน'}
                placeholder={dType === 'percent' ? '0–100' : 'บาท'}
              />
            )}
          </div>
        )}
      </SheetSection>

      <SheetSection n={3} title="การโอน">
        {txs === null ? (
          <p className="adm-meta">กำลังโหลด…</p>
        ) : txs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {txs.map((t) => (
              <a key={t.id} href={`/admin/ledger?q=${encodeURIComponent(t.doc_no)}`} className="adm-notice" style={{ margin: 0, textDecoration: 'none', color: 'inherit' }}>
                ✓ โอนแล้ว <b>{baht(t.net)}</b> · {t.doc_no} · {t.occurred_at.replace('T', ' ')}
                {t.ref_id ? <> · <span className="adm-mono">{t.ref_id}</span></> : t.legacy ? ' · รายการเก่า' : ''}
              </a>
            ))}
            {transferred + 0.5 < net && (
              <p className="adm-hint" style={{ margin: 0 }}>
                ยังขาดอีก {baht(net - transferred)} จากยอดสุทธิ
              </p>
            )}
          </div>
        ) : (
          <p className="adm-hint" style={{ marginTop: 0 }}>
            ยังไม่มีบันทึกการโอน — โอนเงินให้ผู้จัดแล้วกด “บันทึกการโอน” พร้อมเลขอ้างอิงจากแอปธนาคาร ระบบจะตั้งสถานะเป็นโอนแล้ว และส่งใบสำคัญจ่ายทางอีเมล
          </p>
        )}
        <button type="button" className="adm-btn teal" style={{ alignSelf: 'flex-start' }} onClick={() => setRecording(true)} disabled={gross == null}>
          + บันทึกการโอน
        </button>
        <div className="adm-field">
          <label>สถานะการโอน</label>
          <AdmSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="สถานะการโอน">
            <option value="pending">รอโอน</option>
            <option value="paid">โอนแล้ว</option>
          </AdmSelect>
        </div>
        <div className="adm-field">
          <label htmlFor="po-remark">หมายเหตุ (ถึงผู้จัด)</label>
          <textarea id="po-remark" value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} placeholder="เช่น โอนแล้ว รายละเอียดในอีเมล" />
        </div>
      </SheetSection>

      <div className="adm-sticky-foot">
        <button type="button" onClick={onCancel} className="adm-btn">
          ยกเลิก
        </button>
        <button type="button" onClick={save} disabled={saving} className="adm-btn teal">
          {saving ? 'กำลังบันทึก…' : 'บันทึก Payout'}
        </button>
      </div>

      {recording && (
        <RecordTransferSheet
          lockKind
          preset={{
            kind: 'host_payout',
            workshop_id: workshop.id,
            // Shows the host's payout account in the form (migration 077).
            host_id: workshop.instructor_id || undefined,
            gross: Math.max(0, Math.round((net - transferred) * 100) / 100) || undefined,
            payee_name: host?.name,
            payee_email: host?.email,
            description: `รายได้รอบ ${workshop.title}`,
          }}
          onClose={() => setRecording(false)}
          onSaved={(tx, emailed) => {
            setRecording(false);
            setStatus('paid');
            adminToast(`บันทึก ${tx.doc_no} แล้ว${emailed ? ' · ส่งอีเมลแล้ว' : ''}`);
            loadTxs();
          }}
        />
      )}
    </div>
  );
}
