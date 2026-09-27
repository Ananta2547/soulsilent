'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ImageMeta, Workshop } from '@/lib/types';
import { computePayout } from '@/lib/workshop-utils';
import { hostGrossOf } from '@/lib/comp';
import { parseImageMeta } from '@/lib/image-meta';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';

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
    <div className="space-y-5 max-w-2xl">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-4">
          <div className="mono text-[11px] uppercase text-gray mb-1">รายรับรวม</div>
          <div className="text-xl font-bold text-dark">{gross == null ? '…' : baht(gross)}</div>
          <div className="text-xs text-gray mt-1">{paidCount} คนชำระแล้ว</div>
        </div>
        <div className="card !p-4">
          <div className="mono text-[11px] uppercase text-gray mb-1">หักค่าใช้จ่าย</div>
          <div className="text-xl font-bold text-orange-600">− {baht(deduction)}</div>
        </div>
        <div className="card !p-4" style={{ background: 'var(--teal-50)' }}>
          <div className="mono text-[11px] uppercase text-gray mb-1">ยอดโอนสุทธิ</div>
          <div className="text-xl font-bold text-primary">{baht(net)}</div>
        </div>
      </div>

      {/* Deduction config */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40 space-y-3">
        <legend className="text-sm font-medium text-dark px-2">ค่าใช้จ่ายที่หัก</legend>
        <div className="flex flex-wrap items-center gap-3">
          <select value={dType} onChange={(e) => setDType(e.target.value as typeof dType)} className="input-field !w-auto">
            <option value="none">ไม่หัก</option>
            <option value="fixed">จำนวนเงินคงที่ (บาท)</option>
            <option value="percent">เปอร์เซ็นต์ (%)</option>
          </select>
          {dType !== 'none' && (
            <input
              type="number"
              min="0"
              value={dValue}
              onChange={(e) => setDValue(Number(e.target.value))}
              className="input-field !w-40"
              placeholder={dType === 'percent' ? '0–100' : 'บาท'}
            />
          )}
        </div>
      </fieldset>

      {/* Status + remark */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">สถานะการโอน</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input-field">
            <option value="pending">รอโอน</option>
            <option value="paid">โอนแล้ว</option>
          </select>
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
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">หมายเหตุ (ถึงผู้จัด)</label>
        <textarea value={remark} onChange={(e) => setRemark(e.target.value)} className="input-field" rows={3} placeholder="เช่น โอนผ่าน พร้อมเพย์ วันที่…" />
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-lighter">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก...' : 'บันทึก Payout'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
