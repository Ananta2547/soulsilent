'use client';

import { useEffect, useState } from 'react';
import type { ImageMeta } from '@/lib/types';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { AdminSheet, adminAlert } from '@/components/admin/AdminShell';

export type TransferKind = 'refund' | 'host_payout' | 'host_return' | 'expense';

/** What the opener already knows; the admin fills in the rest. */
export type TransferPreset = {
  kind?: TransferKind;
  booking_id?: string;
  workshop_id?: string;
  host_id?: string;
  gross?: number;
  payee_name?: string | null;
  payee_email?: string | null;
  description?: string | null;
};

export type SavedTx = { id: string; doc_no: string; net: number; voucher_token: string };

const KIND_TITLE: Record<TransferKind, string> = {
  refund: 'บันทึกการโอนคืนเงิน',
  host_payout: 'บันทึกการโอนรายได้ผู้จัด',
  host_return: 'บันทึกผู้จัดคืนเงิน',
  expense: 'บันทึกค่าใช้จ่าย',
};

const thaiNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16);

/**
 * "บันทึกการโอน" — records one transfer made by hand in the money ledger,
 * replacing the old "attach a slip" forms. The transaction reference from the
 * bank app is what proves the transfer; a slip photo is optional and only
 * admin can ever see it. The payee gets the voucher link by email.
 */
export function RecordTransferSheet({
  preset,
  lockKind = false,
  onClose,
  onSaved,
}: {
  preset: TransferPreset;
  /** Opened from a booking or a round: the kind cannot change. */
  lockKind?: boolean;
  onClose: () => void;
  onSaved: (tx: SavedTx, emailed: boolean) => void;
}) {
  const [kind, setKind] = useState<TransferKind>(preset.kind || 'expense');
  const [gross, setGross] = useState(preset.gross ? String(preset.gross) : '');
  const [withholding, setWithholding] = useState('');
  const [method, setMethod] = useState<'bank_transfer' | 'promptpay' | 'cash' | 'other'>('bank_transfer');
  const [refId, setRefId] = useState('');
  const [reason, setReason] = useState('');
  const [occurred, setOccurred] = useState(thaiNow());
  const [payee, setPayee] = useState(preset.payee_name || '');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [email, setEmail] = useState(preset.payee_email || '');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState(preset.description || '');
  const [slip, setSlip] = useState('');
  const [slipMeta, setSlipMeta] = useState<ImageMeta | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [cats, setCats] = useState<{ id: string; name: string; active: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== 'expense' || cats.length) return;
    fetch('/api/admin/expense-categories')
      .then(async (r) => ((await r.json()) as { items?: typeof cats }).items || [])
      .then(setCats)
      .catch(() => setCats([]));
  }, [kind, cats.length]);

  const needsRef = method === 'bank_transfer' || method === 'promptpay';
  const g = Number(gross) || 0;
  const w = Number(withholding) || 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          gross: g,
          withholding: w,
          method,
          ref_id: refId.trim() || null,
          no_ref_reason: reason.trim() || null,
          occurred_at: occurred,
          payee_name: payee,
          payee_bank: bank,
          payee_account: account,
          payee_email: email,
          category_id: kind === 'expense' ? categoryId : null,
          description,
          booking_id: preset.booking_id,
          workshop_id: preset.workshop_id,
          host_id: preset.host_id,
          slip_url: slip || null,
          slip_meta: slipMeta,
          send_email: sendEmail,
        }),
      });
      const data = (await res.json()) as { tx?: SavedTx; emailed?: boolean; email_problem?: string | null; error?: string };
      if (!res.ok || !data.tx) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      // Saved either way; say plainly when the payee did not get the email.
      if (data.email_problem) await adminAlert(`บันทึก ${data.tx.doc_no} แล้ว`, data.email_problem);
      onSaved(data.tx, !!data.emailed);
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
      eyebrow="admin · ledger"
      title={KIND_TITLE[kind]}
      sub={preset.description || 'บันทึกด้วยเลขอ้างอิงการโอนแทนสลิป'}
      width={560}
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
      <div className="ldg-form">
        {error && <div className="adm-notice is-bad">{error}</div>}

        {!lockKind && (
          <div className="adm-field">
            <label>ประเภท</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as TransferKind)}>
              <option value="expense">ค่าใช้จ่ายธุรกิจ</option>
              <option value="refund">คืนเงินผู้จอง</option>
              <option value="host_payout">จ่ายรายได้ผู้จัด</option>
            </select>
          </div>
        )}
        {kind === 'expense' && (
          <div className="adm-field">
            <label>หมวดค่าใช้จ่าย</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— เลือกหมวด —</option>
              {cats
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="ldg-row">
          <div className="adm-field">
            <label>ยอดรวม (บาท)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} />
          </div>
          {kind !== 'host_return' && (
            <div className="adm-field">
              <label>หัก ณ ที่จ่าย (บาท)</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={withholding} placeholder="0" onChange={(e) => setWithholding(e.target.value)} />
            </div>
          )}
        </div>
        <p className="adm-hint" style={{ marginTop: -6 }}>
          โอนจริง (สุทธิ) <b>฿{Math.max(0, g - w).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</b>
        </p>

        <div className="ldg-row">
          <div className="adm-field">
            <label>ช่องทาง</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="bank_transfer">โอนผ่านธนาคาร</option>
              <option value="promptpay">PromptPay</option>
              <option value="cash">เงินสด</option>
              <option value="other">อื่น ๆ</option>
            </select>
          </div>
          <div className="adm-field">
            <label>วันเวลาที่โอน</label>
            <input type="datetime-local" value={occurred} max={thaiNow()} onChange={(e) => setOccurred(e.target.value)} />
          </div>
        </div>

        {needsRef ? (
          <div className="adm-field">
            <label>Transaction Reference ID</label>
            <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="เลขที่รายการบนสลิป" className="adm-mono" />
            <p className="adm-hint">ดูได้จากสลิปในแอปธนาคาร (เลขที่รายการ / Ref no.) — ใช้แทนสลิปเป็นหลักฐาน และกันบันทึกซ้ำ</p>
          </div>
        ) : (
          <div className="adm-field">
            <label>เลขอ้างอิง (ถ้ามี)</label>
            <input value={refId} onChange={(e) => setRefId(e.target.value)} className="adm-mono" />
            {!refId.trim() && (
              <>
                <label style={{ marginTop: 10 }}>เหตุผลที่ไม่มีเลขอ้างอิง</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น จ่ายเงินสดหน้างาน มีใบเสร็จร้านค้า" />
              </>
            )}
          </div>
        )}

        <div className="adm-field">
          <label>{kind === 'host_return' ? 'ผู้โอนคืน (ผู้จัด)' : 'ผู้รับเงิน'}</label>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={kind === 'host_return' ? 'ชื่อบัญชีที่โอนมา' : 'ชื่อบัญชีปลายทาง / ร้านค้า'} />
        </div>
        <div className="ldg-row">
          <div className="adm-field">
            <label>ธนาคาร</label>
            <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="เช่น กสิกรไทย" />
          </div>
          <div className="adm-field">
            <label>เลขบัญชี / พร้อมเพย์</label>
            <input value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" />
            <p className="adm-hint">เก็บไว้แค่ 4 หลักท้าย</p>
          </div>
        </div>
        <div className="adm-field">
          <label>อีเมลผู้รับ</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ส่งลิงก์ใบสำคัญจ่ายให้" />
        </div>
        <div className="adm-field">
          <label>รายละเอียด</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <ImageUploader
          label="แนบสลิป / ใบเสร็จ (ไม่บังคับ · เห็นเฉพาะ admin)"
          folder="ledger"
          primary={ASPECTS.LEDGER_SLIP}
          value={slip}
          meta={slipMeta}
          onChange={({ url, meta }) => {
            setSlip(url);
            setSlipMeta(meta);
          }}
        />

        {email.trim() && (
          <label className="adm-check" style={{ padding: '6px 0' }}>
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <span>ส่งอีเมลแจ้งผู้รับ พร้อมลิงก์ใบสำคัญจ่าย</span>
          </label>
        )}
        {kind === 'refund' && preset.booking_id && (
          <p className="adm-notice is-warn" style={{ margin: 0 }}>
            การคืนเงินเต็มจำนวนจะยกเลิกที่นั่งนี้อัตโนมัติ (มัดจำไม่เปลี่ยนสถานะ)
          </p>
        )}
      </div>
    </AdminSheet>
  );
}
