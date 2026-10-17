'use client';

import { useState } from 'react';
import type { ImageMeta } from '@/lib/types';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { AdminSheet } from '@/components/admin/AdminShell';

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
  autoCancels = false,
  onClose,
  onSaved,
}: {
  booking: RefundSlipTarget;
  title?: string;
  /** A full (non-deposit) refund cancels the seat server-side; say so. */
  autoCancels?: boolean;
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
    <AdminSheet
      open
      onClose={onClose}
      eyebrow="admin · refund"
      title={title}
      sub={booking.user_name || booking.user_email || '—'}
      width={520}
      footer={
        <>
          <button type="button" onClick={onClose} className="adm-btn">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={saving} className="adm-btn teal">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="adm-notice is-bad">{error}</div>}
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
        {autoCancels && <p className="adm-notice is-warn" style={{ margin: 0 }}>การแนบสลิปคืนเงินเต็มจำนวนจะยกเลิกที่นั่งนี้อัตโนมัติ</p>}
      </div>
    </AdminSheet>
  );
}
