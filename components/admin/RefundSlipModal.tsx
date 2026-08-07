'use client';

import { useState } from 'react';
import type { ImageMeta } from '@/lib/types';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';

/** Minimal booking shape the modal needs (works for any paid booking). */
export type RefundSlipTarget = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  refund_slip_url: string | null;
  refund_slip_meta: string | null;
};

/**
 * Shared "attach a transfer slip for money returned to the participant" modal.
 * Used both for deposit refunds (on the attendance roster) and general refunds
 * (cancelled bookings). Persists to the booking's refund_slip_url/meta via the
 * existing PUT /api/bookings/[id] contract — no schema change.
 */
export function RefundSlipModal({
  booking,
  title = 'สลิปคืนมัดจำ',
  onClose,
  onSaved,
}: {
  booking: RefundSlipTarget;
  title?: string;
  onClose: () => void;
  onSaved: (url: string | null, meta: ImageMeta | null) => void;
}) {
  const [url, setUrl] = useState(booking.refund_slip_url || '');
  const [meta, setMeta] = useState<ImageMeta | null>(parseImageMeta(booking.refund_slip_meta));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund_slip_url: url || null, refund_slip_meta: meta }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSaved(url || null, meta);
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-lighter flex-shrink-0">
          <div>
            <h2 className="font-heading text-lg text-dark">{title}</h2>
            <p className="text-xs text-gray mt-0.5">{booking.user_name || booking.user_email || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex-shrink-0 w-9 h-9 rounded-full bg-surface hover:bg-gray-lighter text-dark flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <ImageUploader
            label="รูปสลิปโอนเงินคืน"
            folder="refund"
            primary={ASPECTS.REFUND_SLIP}
            value={url}
            meta={meta}
            onChange={({ url: u, meta: m }) => {
              setUrl(u);
              setMeta(m);
            }}
          />
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
