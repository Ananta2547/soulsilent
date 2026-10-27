'use client';

import { useEffect, useState } from 'react';
import type { HostPayoutInfo } from '@/app/api/admin/hosts/[id]/payout-info/route';

type Draft = { bank: string; account_no: string; account_name: string; promptpay: string; note: string };
const EMPTY: Draft = { bank: '', account_no: '', account_name: '', promptpay: '', note: '' };
const toDraft = (i: HostPayoutInfo | null): Draft => ({
  bank: i?.bank || '',
  account_no: i?.account_no || '',
  account_name: i?.account_name || '',
  promptpay: i?.promptpay || '',
  note: i?.note || '',
});

/**
 * Where admin sends a host's earnings (migration 077) — shown in the payout
 * form so the account is at hand, and editable right here. `onLoad` gets the
 * saved details, so the form can fill the payee fields it has left empty.
 */
export function HostPayoutInfoCard({ hostId, onLoad }: { hostId: string; onLoad: (info: HostPayoutInfo) => void }) {
  const [info, setInfo] = useState<HostPayoutInfo | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/hosts/${hostId}/payout-info`)
      .then(async (r) => ((await r.json()) as { info?: HostPayoutInfo | null }).info ?? null)
      .catch(() => null)
      .then((i) => {
        if (!alive) return;
        setInfo(i);
        if (i) onLoad(i);
      });
    return () => {
      alive = false;
    };
    // Once per host: onLoad is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(`/api/admin/hosts/${hostId}/payout-info`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const d = (await r.json()) as { info?: HostPayoutInfo | null; error?: string };
      if (!r.ok) throw new Error(d.error || 'บันทึกไม่สำเร็จ');
      setInfo(d.info ?? null);
      if (d.info) onLoad(d.info);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (info === undefined) return null;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  if (editing) {
    return (
      <div className="adm-soft-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b style={{ fontSize: 14 }}>ช่องทางรับเงินของผู้จัด</b>
        <div className="ldg-row">
          <div className="adm-field">
            <label>ธนาคาร</label>
            <input value={draft.bank} onChange={set('bank')} placeholder="เช่น กสิกรไทย" className="is-white" />
          </div>
          <div className="adm-field">
            <label>เลขบัญชี</label>
            <input value={draft.account_no} onChange={set('account_no')} inputMode="numeric" className="is-white adm-mono" />
          </div>
        </div>
        <div className="ldg-row">
          <div className="adm-field">
            <label>ชื่อบัญชี</label>
            <input value={draft.account_name} onChange={set('account_name')} className="is-white" />
          </div>
          <div className="adm-field">
            <label>พร้อมเพย์</label>
            <input value={draft.promptpay} onChange={set('promptpay')} inputMode="numeric" placeholder="เบอร์โทร / เลขบัตร" className="is-white adm-mono" />
          </div>
        </div>
        <div className="adm-field">
          <label>Note</label>
          <textarea value={draft.note} onChange={set('note')} rows={2} placeholder="เช่น โอนทุกวันที่ 5 · ชื่อบัญชีเป็นชื่อบริษัท · ขอใบสำคัญทางอีเมล" className="is-white" />
        </div>
        {err && <div className="adm-notice is-bad">{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="adm-btn sm" onClick={() => setEditing(false)}>
            ยกเลิก
          </button>
          <button type="button" className="adm-btn sm teal" disabled={saving} onClick={save}>
            {saving ? 'กำลังบันทึก…' : 'บันทึกช่องทาง'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-soft-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14, flex: 1 }}>ช่องทางรับเงินของผู้จัด</b>
        <button
          type="button"
          className="adm-link-btn"
          onClick={() => {
            setDraft(toDraft(info));
            setEditing(true);
          }}
        >
          {info ? 'แก้ไข' : '+ เพิ่ม'}
        </button>
      </div>
      {!info ? (
        <span className="adm-meta">ยังไม่ได้บันทึก — เพิ่มไว้ครั้งเดียว ครั้งหน้าระบบกรอกให้</span>
      ) : (
        <>
          {(info.bank || info.account_no) && (
            <span style={{ fontSize: 14 }}>
              {info.bank || 'ธนาคาร —'} <span className="adm-mono">{info.account_no || ''}</span>
              {info.account_name ? ` · ${info.account_name}` : ''}
            </span>
          )}
          {info.promptpay && (
            <span style={{ fontSize: 14 }}>
              พร้อมเพย์ <span className="adm-mono">{info.promptpay}</span>
            </span>
          )}
          {info.note && (
            <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
              <b>Note:</b> {info.note}
            </span>
          )}
          <span className="adm-meta" style={{ fontSize: 12 }}>
            แก้ล่าสุด {info.updated_at?.slice(0, 10)}
            {info.updated_by_name ? ` โดย ${info.updated_by_name}` : ''}
          </span>
        </>
      )}
    </div>
  );
}
