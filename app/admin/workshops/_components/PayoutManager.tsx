'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ImageMeta, Workshop } from '@/lib/types';
import { computePayout } from '@/lib/workshop-utils';
import { hostGrossOf } from '@/lib/comp';
import { parseImageMeta } from '@/lib/image-meta';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { AdmSelect } from '@/components/admin/pickers';
import { SheetSection } from '@/components/admin/AdminShell';

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

export function PayoutManager({
  workshop,
  onSuccess,
  onCancel,
}: {
  workshop: Workshop;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [dType, setDType] = useState<'none' | 'fixed' | 'percent'>(workshop.payout_deduction_type || 'none');
  const [dValue, setDValue] = useState<number>(workshop.payout_deduction_value || 0);
  const [status, setStatus] = useState<'pending' | 'paid'>(workshop.payout_status || 'pending');
  const [remark, setRemark] = useState(workshop.payout_remark || '');
  const [slipUrl, setSlipUrl] = useState(workshop.payout_slip_url || '');
  const [slipMeta, setSlipMeta] = useState<ImageMeta | null>(parseImageMeta(workshop.payout_slip_meta));

  const [gross, setGross] = useState<number | null>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gross revenue = sum of paid bookings for this workshop.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bookings?workshop_id=${workshop.id}`);
        const data = (await res.json()) as { bookings?: { amount: number; host_credit?: number; payment_status: string; status: string }[] };
        const paid = (data.bookings || []).filter((b) => b.payment_status === 'paid' || b.status === 'confirmed');
        setPaidCount(paid.length);
        // Includes what ASL covers for invitation seats (lib/comp.ts).
        setGross(paid.reduce((s, b) => s + hostGrossOf(b), 0));
      } catch {
        setGross(0);
      }
    })();
  }, [workshop.id]);

  const { deduction, net } = useMemo(() => computePayout(gross || 0, dType, dValue), [gross, dType, dValue]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workshops/${workshop.id}/payout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deduction_type: dType,
          deduction_value: dValue,
          status,
          remark,
          slip_url: slipUrl || null,
          slip_meta: slipMeta,
        }),
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
            <div className="adm-label">หักค่าใช้จ่าย</div>
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

      <SheetSection n={2} title="ค่าใช้จ่ายที่หัก">
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
      </SheetSection>

      <SheetSection n={3} title="การโอน">
        <div className="adm-field">
          <label>สถานะการโอน</label>
          <AdmSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="สถานะการโอน">
            <option value="pending">รอโอน</option>
            <option value="paid">โอนแล้ว</option>
          </AdmSelect>
        </div>
        <ImageUploader
          label="สลิปโอนเงิน"
          folder="payout"
          primary={ASPECTS.PAYOUT_SLIP}
          value={slipUrl}
          meta={slipMeta}
          onChange={({ url, meta }) => {
            setSlipUrl(url);
            setSlipMeta(meta);
          }}
        />
        <div className="adm-field">
          <label htmlFor="po-remark">หมายเหตุ (ถึงผู้จัด)</label>
          <textarea id="po-remark" value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} placeholder="เช่น โอนผ่าน พร้อมเพย์ วันที่…" />
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
    </div>
  );
}
