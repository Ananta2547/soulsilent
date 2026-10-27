'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageMeta } from '@/lib/types';
import type { MoneyTx } from '@/lib/ledger-shared';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { AdminSheet, adminAlert } from '@/components/admin/AdminShell';
import { parseSlipQr, type SlipFields } from '@/lib/slip-reader';

export type TransferKind = 'refund' | 'host_payout' | 'host_return' | 'income' | 'expense';

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
  income: 'บันทึกรายรับ',
  expense: 'บันทึกค่าใช้จ่าย',
};
/** Kinds where money comes in: the other side is who paid us. */
const INCOMING: TransferKind[] = ['host_return', 'income'];

const thaiNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16);
type Method = 'bank_transfer' | 'promptpay' | 'cash' | 'other';

/** The QR on a slip, read in the browser (jsQR). Null when there is none. */
async function qrFromImage(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { default: jsQR } = await import('jsqr');
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * "บันทึกการโอน" — records one transfer made by hand in the money ledger (or,
 * with `edit`, corrects one already recorded; the change is kept in its
 * history). The transaction reference from the bank app is what proves the
 * transfer; a slip photo is optional and only admin can see it. Attaching a
 * slip fills the form from it: the QR gives the reference, Gemini reads the
 * rest — admin checks before saving.
 */
export function RecordTransferSheet({
  preset,
  edit,
  lockKind = false,
  onClose,
  onSaved,
}: {
  preset: TransferPreset;
  /** A recorded row to correct instead of a new one. */
  edit?: MoneyTx;
  /** Opened from a booking or a round: the kind cannot change. */
  lockKind?: boolean;
  onClose: () => void;
  onSaved: (tx: SavedTx, emailed: boolean) => void;
}) {
  const [kind, setKind] = useState<TransferKind>((edit?.kind as TransferKind) || preset.kind || 'expense');
  const [gross, setGross] = useState(edit ? String(edit.gross) : preset.gross ? String(preset.gross) : '');
  const [withholding, setWithholding] = useState(edit?.withholding ? String(edit.withholding) : '');
  const [method, setMethod] = useState<Method>(edit && edit.method !== 'beam' && edit.method !== 'bank_api' ? (edit.method as Method) : 'bank_transfer');
  const [refId, setRefId] = useState(edit?.ref_id || '');
  const [reason, setReason] = useState(edit?.no_ref_reason || '');
  const [occurred, setOccurred] = useState(edit?.occurred_at || thaiNow());
  const [payee, setPayee] = useState(edit?.payee_name || preset.payee_name || '');
  const [bank, setBank] = useState(edit?.payee_bank || '');
  const [account, setAccount] = useState('');
  const [email, setEmail] = useState(edit?.payee_email || preset.payee_email || '');
  const [categoryId, setCategoryId] = useState(edit?.category_id || '');
  const [description, setDescription] = useState(edit?.description || preset.description || '');
  const [slip, setSlip] = useState(edit?.slip_url || '');
  const [slipMeta, setSlipMeta] = useState<ImageMeta | null>(() => {
    try {
      return edit?.slip_meta ? (JSON.parse(edit.slip_meta) as ImageMeta) : null;
    } catch {
      return null;
    }
  });
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(!edit);
  const [cats, setCats] = useState<{ id: string; name: string; active: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ state: 'busy' | 'done' | 'error'; msg: string } | null>(null);
  // Fields the admin typed into: reading a slip never overwrites them.
  const touched = useRef(new Set<string>());
  const touch = (k: string) => touched.current.add(k);

  const beamRow = !!edit && (edit.ref_source === 'beam' || edit.method === 'beam');
  const incoming = INCOMING.includes(kind);

  useEffect(() => {
    if (kind !== 'expense' || cats.length) return;
    fetch('/api/admin/expense-categories')
      .then(async (r) => ((await r.json()) as { items?: typeof cats }).items || [])
      .then(setCats)
      .catch(() => setCats([]));
  }, [kind, cats.length]);

  const needsRef = method === 'bank_transfer' || method === 'promptpay';
  const g = Number(gross) || 0;
  const w = incoming ? 0 : Number(withholding) || 0;

  /** Fill the form from a slip just attached. */
  async function readSlip(url: string, original?: string | null) {
    setReading({ state: 'busy', msg: 'กำลังอ่านสลิป…' });
    const [qrText, ai] = await Promise.all([
      qrFromImage(original || url).then((t) => t || (original ? qrFromImage(url) : null)),
      fetch('/api/admin/ledger/read-slip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, original_url: original || null }) })
        .then(async (r) => {
          const d = (await r.json()) as { fields?: SlipFields; error?: string };
          return r.ok && d.fields ? { fields: d.fields } : { error: d.error || 'อ่านสลิปไม่สำเร็จ' };
        })
        .catch(() => ({ error: 'เชื่อมต่อไม่ได้' })),
    ]);
    const qr = qrText ? parseSlipQr(qrText) : null;
    const f = 'fields' in ai ? ai.fields : null;
    const filled: string[] = [];
    const put = (k: string, v: string | null | undefined, set: (v: string) => void, current: string) => {
      if (!v || touched.current.has(k) || (current && k !== 'occurred')) return;
      set(v);
      filled.push(k);
    };
    const ref = qr?.ref || f?.ref || null;
    put('ref', ref, setRefId, refId);
    put('gross', f?.amount != null ? String(f.amount) : null, setGross, gross);
    if (f?.date && !touched.current.has('occurred')) {
      setOccurred(`${f.date}T${f.time || '00:00'}`);
      filled.push('occurred');
    }
    if (f?.promptpay && !touched.current.has('method')) setMethod('promptpay');
    // The other side of the transfer: who we paid, or who paid us.
    put('payee', incoming ? f?.from_name : f?.to_name, setPayee, payee);
    put('bank', incoming ? f?.from_bank || qr?.bank : f?.to_bank, setBank, bank);
    if (!incoming) put('account', f?.to_account?.replace(/[^0-9xX]/g, ''), setAccount, account);
    put('description', f?.memo, setDescription, description);
    if (filled.length) setReading({ state: 'done', msg: `กรอกจากสลิปแล้ว ${filled.length} ช่อง${'error' in ai ? ' (อ่านได้แค่ QR)' : ''} — ตรวจให้ถูกก่อนบันทึก` });
    else setReading({ state: 'error', msg: ('error' in ai && ai.error) || 'ไม่พบข้อมูลที่อ่านได้บนสลิป — กรอกเอง' });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
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
        note,
      };
      const res = await fetch(edit ? `/api/admin/ledger/${edit.id}` : '/api/admin/ledger', {
        method: edit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      eyebrow={edit ? `admin · ${edit.doc_no}` : 'admin · ledger'}
      title={edit ? `แก้ไข ${edit.doc_no}` : KIND_TITLE[kind]}
      sub={edit ? (beamRow ? 'รายการจาก Beam แก้ได้เฉพาะรายละเอียด' : 'การแก้ไขเก็บเป็นประวัติ — ใครแก้อะไร เมื่อไร') : preset.description || 'บันทึกด้วยเลขอ้างอิงการโอนแทนสลิป'}
      width={560}
      footer={
        <>
          <button type="button" onClick={onClose} className="adm-btn">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={saving || reading?.state === 'busy'} className="adm-btn teal">
            {saving ? 'กำลังบันทึก…' : edit ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </>
      }
    >
      <div className="ldg-form">
        {error && <div className="adm-notice is-bad">{error}</div>}

        {!lockKind && !edit && (
          <div className="adm-field">
            <label>ประเภท</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as TransferKind)}>
              <option value="expense">ค่าใช้จ่ายธุรกิจ</option>
              <option value="income">รายรับอื่น (สปอนเซอร์ ทุน ดอกเบี้ย ฯลฯ)</option>
              <option value="refund">คืนเงินผู้จอง</option>
              <option value="host_payout">จ่ายรายได้ผู้จัด</option>
            </select>
          </div>
        )}

        {!beamRow && (
          <>
            <ImageUploader
              label="สลิป / ใบเสร็จ — แนบแล้วระบบกรอกให้ (ไม่บังคับ · เห็นเฉพาะ admin)"
              folder="ledger"
              primary={ASPECTS.LEDGER_SLIP}
              value={slip}
              meta={slipMeta}
              onChange={({ url, meta }) => {
                const fresh = !!url && url !== slip;
                setSlip(url);
                setSlipMeta(meta);
                if (fresh) readSlip(url, meta?.original_url);
              }}
            />
            {reading && <div className={`adm-notice${reading.state === 'error' ? ' is-warn' : ''}`}>{reading.msg}</div>}
          </>
        )}

        {kind === 'expense' && !beamRow && (
          <div className="adm-field">
            <label>หมวดค่าใช้จ่าย</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— เลือกหมวด —</option>
              {cats
                .filter((c) => c.active || c.id === categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <fieldset disabled={beamRow} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
          <div className="ldg-row">
            <div className="adm-field">
              <label>ยอดรวม (บาท)</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={gross} onChange={(e) => (touch('gross'), setGross(e.target.value))} />
            </div>
            {!incoming && (
              <div className="adm-field">
                <label>หัก ณ ที่จ่าย (บาท)</label>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={withholding} placeholder="0" onChange={(e) => setWithholding(e.target.value)} />
              </div>
            )}
          </div>
          {!incoming && (
            <p className="adm-hint" style={{ marginTop: -6 }}>
              โอนจริง (สุทธิ) <b>฿{Math.max(0, g - w).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</b>
            </p>
          )}

          <div className="ldg-row">
            <div className="adm-field">
              <label>ช่องทาง</label>
              <select value={method} onChange={(e) => (touch('method'), setMethod(e.target.value as Method))}>
                <option value="bank_transfer">โอนผ่านธนาคาร</option>
                <option value="promptpay">PromptPay</option>
                <option value="cash">เงินสด</option>
                <option value="other">อื่น ๆ</option>
              </select>
            </div>
            <div className="adm-field">
              <label>วันเวลาที่โอน</label>
              <input type="datetime-local" value={occurred} max={thaiNow()} onChange={(e) => (touch('occurred'), setOccurred(e.target.value))} />
            </div>
          </div>

          {needsRef ? (
            <div className="adm-field">
              <label>Transaction Reference ID</label>
              <input value={refId} onChange={(e) => (touch('ref'), setRefId(e.target.value))} placeholder="เลขที่รายการบนสลิป" className="adm-mono" />
              <p className="adm-hint">ดูได้จากสลิปในแอปธนาคาร (เลขที่รายการ / Ref no.) — ใช้แทนสลิปเป็นหลักฐาน และกันบันทึกซ้ำ</p>
            </div>
          ) : (
            <div className="adm-field">
              <label>เลขอ้างอิง (ถ้ามี)</label>
              <input value={refId} onChange={(e) => (touch('ref'), setRefId(e.target.value))} className="adm-mono" />
              {!refId.trim() && (
                <>
                  <label style={{ marginTop: 10 }}>เหตุผลที่ไม่มีเลขอ้างอิง</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น จ่ายเงินสดหน้างาน มีใบเสร็จร้านค้า" />
                </>
              )}
            </div>
          )}

          <div className="adm-field">
            <label>{kind === 'host_return' ? 'ผู้โอนคืน (ผู้จัด)' : kind === 'income' ? 'ผู้จ่ายเงิน / แหล่งรายรับ' : 'ผู้รับเงิน'}</label>
            <input
              value={payee}
              onChange={(e) => (touch('payee'), setPayee(e.target.value))}
              placeholder={incoming ? 'ชื่อบัญชีที่โอนมา / บริษัท' : 'ชื่อบัญชีปลายทาง / ร้านค้า'}
            />
          </div>
          <div className="ldg-row">
            <div className="adm-field">
              <label>ธนาคาร</label>
              <input value={bank} onChange={(e) => (touch('bank'), setBank(e.target.value))} placeholder="เช่น กสิกรไทย" />
            </div>
            <div className="adm-field">
              <label>เลขบัญชี / พร้อมเพย์</label>
              <input
                value={account}
                onChange={(e) => (touch('account'), setAccount(e.target.value))}
                inputMode="numeric"
                placeholder={edit?.payee_account ? `เดิม ${edit.payee_account}` : undefined}
              />
              <p className="adm-hint">เก็บไว้แค่ 4 หลักท้าย{edit ? ' · เว้นว่าง = ใช้ของเดิม' : ''}</p>
            </div>
          </div>
          <div className="adm-field">
            <label>{incoming ? 'อีเมลผู้จ่าย' : 'อีเมลผู้รับ'}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ส่งลิงก์ใบสำคัญให้" />
          </div>
        </fieldset>

        <div className="adm-field">
          <label>รายละเอียด</label>
          <input value={description} onChange={(e) => (touch('description'), setDescription(e.target.value))} />
        </div>

        {edit && (
          <div className="adm-field">
            <label>เหตุผลที่แก้ (ไม่บังคับ)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น พิมพ์ยอดผิด แก้ตามสลิป" />
          </div>
        )}

        {email.trim() && (
          <label className="adm-check" style={{ padding: '6px 0' }}>
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <span>{edit ? 'ส่งใบสำคัญฉบับแก้ไขให้ทางอีเมล' : 'ส่งอีเมลแจ้ง พร้อมลิงก์ใบสำคัญ'}</span>
          </label>
        )}
        {kind === 'refund' && preset.booking_id && !edit && (
          <p className="adm-notice is-warn" style={{ margin: 0 }}>
            การคืนเงินเต็มจำนวนจะยกเลิกที่นั่งนี้อัตโนมัติ (มัดจำไม่เปลี่ยนสถานะ)
          </p>
        )}
      </div>
    </AdminSheet>
  );
}
