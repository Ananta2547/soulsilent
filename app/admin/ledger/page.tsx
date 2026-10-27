'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminChips, AdminSearch, AdminSheet, Badge, RowMenu, adminAlert, adminConfirm, adminToast } from '@/components/admin/AdminShell';
import { RecordTransferSheet } from '@/components/admin/ledger/RecordTransferSheet';
import { PendingMoney } from '@/components/admin/ledger/PendingMoney';
import { KIND_LABEL, METHOD_LABEL, type MoneyTx, type TxKind, type TxMethod } from '@/lib/ledger-shared';

type Row = MoneyTx & { category_name: string | null; workshop_title: string | null; workshop_date: string | null };
type Totals = { in: number; out: number; withholding: number; count: number };
type Cat = { id: string; name: string; sort: number; active: number };
type Edit = { id: string; edited_at: string; note: string | null; editor: string | null; before: Record<string, unknown>; after: Record<string, unknown> };

/** Thai names of the fields an edit can change, for the history list. */
const FIELD_LABEL: Record<string, string> = {
  gross: 'ยอดรวม',
  withholding: 'หัก ณ ที่จ่าย',
  net: 'สุทธิ',
  method: 'ช่องทาง',
  ref_id: 'เลขอ้างอิง',
  ref_source: 'ที่มาเลขอ้างอิง',
  no_ref_reason: 'เหตุผลไม่มีเลขอ้างอิง',
  occurred_at: 'วันเวลา',
  payee_name: 'ชื่อ',
  payee_bank: 'ธนาคาร',
  payee_account: 'เลขบัญชี',
  payee_email: 'อีเมล',
  category_id: 'หมวด',
  description: 'รายละเอียด',
  slip_url: 'สลิป',
  slip_meta: 'การครอบสลิป',
};

type Filter = 'all' | 'in' | 'income' | 'refund' | 'host_payout' | 'expense' | 'void';

const baht = (n: number) => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const when = (s: string) => s.replace('T', ' ');
// Inline so it beats the admin-wide full-width input rule.
const DATE_INPUT = { width: 150, flex: '0 0 auto', minHeight: 38 } as const;

function query(filter: Filter, q: string, from: string, to: string) {
  const p = new URLSearchParams();
  if (filter === 'in') p.set('direction', 'in');
  else if (filter === 'void') p.set('status', 'void');
  else if (filter !== 'all') p.set('kind', filter);
  if (q.trim()) p.set('q', q.trim());
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return p.toString();
}

/**
 * บัญชีการเงิน — every movement of money by its transaction reference.
 * Beam payments and refunds arrive on their own; refunds, host payouts and
 * business expenses transferred by hand are recorded here (or from the
 * booking / round they belong to). Each money-out row is its own payment
 * voucher, sent to the payee by email.
 */
export default function AdminLedgerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [adding, setAdding] = useState<'expense' | 'income' | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [history, setHistory] = useState<Edit[] | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [catsOpen, setCatsOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/ledger?${query(filter, q, from, to)}`)
      .then(async (r) => (await r.json()) as { items?: Row[]; totals?: Totals })
      .then((d) => {
        setRows(d.items || []);
        setTotals(d.totals || null);
      })
      .catch(() => setRows([]));
  }, [filter, q, from, to]);

  // Opened from a booking's "คืนแล้ว · PV-…" link: start on that document.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('q');
    // Read once after mount (the server render has no URL to read from).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl) setQ(fromUrl);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/admin/ledger/' + open.id)
      .then(async (r) => ((await r.json()) as { edits?: Edit[] }).edits || [])
      .then((e) => alive && setHistory(e))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
      setHistory(null);
    };
  }, [open]);

  async function importLegacy() {
    if (!(await adminConfirm({ title: 'ดึงรายการเก่าเข้าบัญชี?', msg: 'เงินเข้าจาก Beam ที่ยังไม่อยู่ในบัญชี + สลิปคืนเงินและสลิปจ่ายผู้จัดเดิม จะถูกบันทึกเป็น "รายการเก่า" — กดซ้ำได้ ไม่บันทึกซ้ำ', ok: 'ดึงข้อมูล' }))) return;
    const r = await fetch('/api/admin/ledger/import', { method: 'POST' });
    const d = (await r.json()) as { beam?: number; refunds?: number; payouts?: number; error?: string };
    if (!r.ok) return adminAlert('ดึงข้อมูลไม่สำเร็จ', d.error);
    adminToast(`เพิ่ม Beam ${d.beam || 0} · คืนเงิน ${d.refunds || 0} · จ่ายผู้จัด ${d.payouts || 0}`);
    load();
  }

  async function doVoid() {
    if (!voiding) return;
    const r = await fetch(`/api/admin/ledger/${voiding.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'void', reason: voidReason }),
    });
    const d = (await r.json()) as { error?: string };
    if (!r.ok) return adminAlert('ยกเลิกไม่ได้', d.error);
    adminToast(`ยกเลิก ${voiding.doc_no} แล้ว`);
    setVoiding(null);
    setVoidReason('');
    setOpen(null);
    load();
  }

  async function resend(t: Row) {
    const r = await fetch(`/api/admin/ledger/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'email' }) });
    const d = (await r.json()) as { sent?: boolean; email_problem?: string | null; error?: string };
    if (!r.ok) return adminAlert('ส่งไม่ได้', d.error);
    if (!d.sent) return adminAlert('อีเมลยังไม่ออก', d.email_problem || undefined);
    adminToast(`ส่งอีเมลถึง ${t.payee_email} แล้ว`);
    load();
  }

  const exportHref = `/api/admin/ledger?${query(filter, q, from, to)}&format=csv`;

  const menu = (t: Row) => [
    { label: 'ดูรายละเอียด', onClick: () => setOpen(t) },
    { label: t.ref_source === 'beam' ? 'แก้ไขรายละเอียด' : 'แก้ไข', disabled: t.status === 'void', onClick: () => setEditing(t) },
    { label: t.direction === 'out' ? 'เปิดใบสำคัญจ่าย' : 'เปิดใบสำคัญรับ', href: `/voucher/${t.voucher_token}` },
    ...(t.direction === 'out' && t.payee_email && t.status === 'done' ? [{ label: 'ส่งอีเมลใบสำคัญจ่ายอีกครั้ง', onClick: () => resend(t) }] : []),
    { label: 'ยกเลิกรายการ', danger: true, disabled: t.status === 'void' || t.ref_source === 'beam', onClick: () => setVoiding(t) },
  ];

  const kindCell = (t: Row) => (
    <>
      <div style={{ fontWeight: 600 }}>{KIND_LABEL[t.kind as TxKind]}</div>
      <div className="adm-meta">{[t.category_name, t.payee_name, t.workshop_title || t.description].filter(Boolean).join(' · ') || '—'}</div>
    </>
  );
  const badges = (t: Row) => (
    <span className="adm-badges" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {t.status === 'void' && <Badge tone="bad">ยกเลิก</Badge>}
      {!!t.legacy && <Badge tone="mute">รายการเก่า</Badge>}
      {t.slip_url && <Badge tone="info">มีสลิป</Badge>}
      {t.emailed_at && <Badge tone="teal">ส่งอีเมลแล้ว</Badge>}
    </span>
  );
  const refCell = (t: Row) =>
    t.ref_id ? (
      <code className="adm-mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
        {t.ref_id}
      </code>
    ) : (
      <span className="adm-meta">{t.no_ref_reason || '—'}</span>
    );
  const amount = (t: Row) => (
    <span className={`ldg-amt ${t.direction}${t.status === 'void' ? ' is-void' : ''}`}>
      {t.direction === 'in' ? '+' : '−'}
      {baht(t.net)}
    </span>
  );

  return (
    <>
      <AdminHead
        eyebrow="admin · ledger"
        title="บัญชีการเงิน"
        sub="ทุกการเคลื่อนไหวของเงิน บันทึกด้วยเลขอ้างอิงการโอนแทนสลิป — รายการจ่ายออกแต่ละแถวคือใบสำคัญจ่าย"
        actions={
          <>
            <button type="button" className="adm-btn" onClick={() => setCatsOpen(true)}>
              หมวดค่าใช้จ่าย
            </button>
            <button type="button" className="adm-btn" onClick={importLegacy}>
              ดึงรายการเก่า
            </button>
            <button type="button" className="adm-btn" onClick={() => setAdding('income')}>
              + รายรับ
            </button>
            <button type="button" className="adm-btn teal" onClick={() => setAdding('expense')}>
              + บันทึกรายการ
            </button>
          </>
        }
      />

      <PendingMoney onRecorded={load} />

      {totals && (
        <div className="ldg-sums">
          <div className="adm-card ldg-sum">
            <div className="adm-label">เงินเข้า</div>
            <div className="ldg-sum-n in">{baht(totals.in)}</div>
          </div>
          <div className="adm-card ldg-sum">
            <div className="adm-label">เงินออก</div>
            <div className="ldg-sum-n out">{baht(totals.out)}</div>
          </div>
          <div className="adm-card ldg-sum">
            <div className="adm-label">คงเหลือสุทธิ</div>
            <div className="ldg-sum-n">{baht(totals.in - totals.out)}</div>
          </div>
          {totals.withholding > 0 && (
            <div className="adm-card ldg-sum">
              <div className="adm-label">หัก ณ ที่จ่ายสะสม</div>
              <div className="ldg-sum-n">{baht(totals.withholding)}</div>
            </div>
          )}
        </div>
      )}

      <div className="adm-toolbar">
        <AdminSearch value={q} onChange={setQ} placeholder="ค้นหาเลขเอกสาร เลขอ้างอิง ผู้รับ หรือกิจกรรม" />
        <AdminChips
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'in', label: 'เงินเข้า' },
            { key: 'income', label: 'รายรับอื่น' },
            { key: 'refund', label: 'คืนเงิน' },
            { key: 'host_payout', label: 'จ่ายผู้จัด' },
            { key: 'expense', label: 'ค่าใช้จ่าย' },
            { key: 'void', label: 'ยกเลิก' },
          ]}
        />
        <div className="ldg-dates">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ตั้งแต่" style={DATE_INPUT} />
          <span>–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ถึง" style={DATE_INPUT} />
          <a className="adm-btn" href={exportHref}>
            CSV
          </a>
        </div>
      </div>

      {rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <PageLoader />
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-card adm-empty">
          ยังไม่มีรายการ{filter !== 'all' || q || from || to ? 'ตามที่ค้นหา' : ' — กด “ดึงรายการเก่า” เพื่อนำข้อมูลเดิมเข้ามา'}
        </div>
      ) : (
        <div className="adm-card">
          <div className="adm-table-wrap has-cards">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>เลขที่ / วันเวลา</th>
                  <th>รายการ</th>
                  <th>เลขอ้างอิง</th>
                  <th style={{ textAlign: 'right' }}>สุทธิ</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} style={{ opacity: t.status === 'void' ? 0.55 : 1 }}>
                    <td>
                      <button type="button" className="adm-link-title ldg-doc" onClick={() => setOpen(t)}>
                        {t.doc_no}
                      </button>
                      <div className="adm-meta">
                        {when(t.occurred_at)} · {METHOD_LABEL[t.method as TxMethod]}
                      </div>
                    </td>
                    <td>{kindCell(t)}</td>
                    <td style={{ maxWidth: 220 }}>{refCell(t)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{amount(t)}</td>
                    <td>{badges(t)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <RowMenu items={menu(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="adm-mcards">
            {rows.map((t) => (
              <div key={t.id} className="adm-mcard" style={{ opacity: t.status === 'void' ? 0.55 : 1 }}>
                <div className="adm-mcard-top">
                  <div onClick={() => setOpen(t)} style={{ cursor: 'pointer', minWidth: 0 }}>
                    <div className="adm-mcard-title">
                      {KIND_LABEL[t.kind as TxKind]} {amount(t)}
                    </div>
                    <div className="adm-mcard-sub">
                      {t.doc_no} · {when(t.occurred_at)}
                    </div>
                  </div>
                  <RowMenu items={menu(t)} />
                </div>
                <div className="adm-meta">{[t.category_name, t.payee_name, t.workshop_title || t.description].filter(Boolean).join(' · ')}</div>
                <div>{refCell(t)}</div>
                {badges(t)}
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <RecordTransferSheet
          preset={{ kind: adding }}
          onClose={() => setAdding(null)}
          onSaved={(tx, emailed) => {
            setAdding(null);
            adminToast(`บันทึก ${tx.doc_no} แล้ว${emailed ? ' · ส่งอีเมลแล้ว' : ''}`);
            load();
          }}
        />
      )}

      {editing && (
        <RecordTransferSheet
          edit={editing}
          preset={{}}
          onClose={() => setEditing(null)}
          onSaved={(tx, emailed) => {
            setEditing(null);
            setOpen(null);
            adminToast('แก้ไข ' + tx.doc_no + ' แล้ว' + (emailed ? ' · ส่งอีเมลแล้ว' : ''));
            load();
          }}
        />
      )}

      {open && (
        <AdminSheet
          open
          onClose={() => setOpen(null)}
          eyebrow={`admin · ${open.doc_no}`}
          title={KIND_LABEL[open.kind as TxKind]}
          sub={`${when(open.occurred_at)} · ${open.direction === 'in' ? 'เงินเข้า' : 'เงินออก'}`}
          width={560}
          footer={
            <>
              {open.status === 'done' && open.ref_source !== 'beam' && (
                <button type="button" className="adm-btn" style={{ marginRight: 'auto', color: '#a3261a' }} onClick={() => setVoiding(open)}>
                  ยกเลิกรายการ
                </button>
              )}
              {open.status === 'done' && (
                <button type="button" className="adm-btn" onClick={() => (setEditing(open), setOpen(null))}>
                  แก้ไข
                </button>
              )}
              <a className="adm-btn teal" href={`/voucher/${open.voucher_token}`} target="_blank" rel="noopener noreferrer">
                {open.direction === 'out' ? 'ใบสำคัญจ่าย' : 'ใบสำคัญรับ'} ↗
              </a>
            </>
          }
        >
          <dl className="ldg-dl">
            <dt>ยอดรวม</dt>
            <dd>{baht(open.gross)}</dd>
            {open.withholding > 0 && (
              <>
                <dt>หัก ณ ที่จ่าย</dt>
                <dd>{baht(open.withholding)}</dd>
              </>
            )}
            <dt>สุทธิ</dt>
            <dd>{amount(open)}</dd>
            <dt>ช่องทาง</dt>
            <dd>{METHOD_LABEL[open.method as TxMethod]}</dd>
            <dt>เลขอ้างอิง</dt>
            <dd>
              {refCell(open)}
              {open.ref_source && <span className="adm-meta"> · {open.ref_source}</span>}
            </dd>
            {open.category_name && (
              <>
                <dt>หมวด</dt>
                <dd>{open.category_name}</dd>
              </>
            )}
            <dt>{open.direction === 'in' ? 'ผู้จ่าย' : 'ผู้รับ'}</dt>
            <dd>{[open.payee_name, open.payee_bank, open.payee_account].filter(Boolean).join(' · ') || '—'}</dd>
            {open.payee_email && (
              <>
                <dt>อีเมล</dt>
                <dd>
                  {open.payee_email}
                  {open.emailed_at ? <span className="adm-meta"> · ส่งแล้ว {open.emailed_at}</span> : null}
                  {open.direction === 'out' && open.status === 'done' && (
                    <button type="button" className="adm-btn" style={{ marginLeft: 8, minHeight: 28, padding: '0 10px', fontSize: 12 }} onClick={() => resend(open)}>
                      ส่งอีกครั้ง
                    </button>
                  )}
                </dd>
              </>
            )}
            {(open.workshop_title || open.description) && (
              <>
                <dt>รายละเอียด</dt>
                <dd>
                  {[open.description, open.workshop_title && open.workshop_title !== open.description ? `กิจกรรม ${open.workshop_title}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </>
            )}
            {open.status === 'void' && (
              <>
                <dt>ยกเลิก</dt>
                <dd>
                  {open.voided_at} — {open.void_reason}
                </dd>
              </>
            )}
            <dt>บันทึกเมื่อ</dt>
            <dd className="adm-meta">
              {open.created_at}
              {open.legacy ? ' · รายการเก่า' : ''}
            </dd>
          </dl>
          {open.slip_url && (
            <a href={open.slip_url} target="_blank" rel="noopener noreferrer" className="ldg-slip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.slip_url} alt="สลิป" />
            </a>
          )}
          {history && history.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="adm-label" style={{ marginBottom: 8 }}>
                ประวัติการแก้ไข
              </div>
              {history.map((h) => (
                <div key={h.id} className="adm-notice" style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {h.edited_at} · {h.editor || '—'}
                    {h.note ? ' · ' + h.note : ''}
                  </div>
                  {Object.keys(h.after)
                    .filter((k) => k !== 'slip_meta' && k !== 'ref_source')
                    .map((k) => (
                      <div key={k} className="adm-meta">
                        {FIELD_LABEL[k] || k}: {String(h.before[k] ?? '—')} → {String(h.after[k] ?? '—')}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </AdminSheet>
      )}

      {voiding && (
        <AdminSheet
          open
          onClose={() => setVoiding(null)}
          eyebrow="admin · void"
          title={`ยกเลิก ${voiding.doc_no}`}
          sub="รายการไม่ถูกลบ — เก็บไว้พร้อมเหตุผลและผู้ยกเลิก"
          width={460}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setVoiding(null)}>
                ไม่ยกเลิก
              </button>
              <button type="button" className="adm-btn teal" disabled={!voidReason.trim()} onClick={doVoid}>
                ยืนยันยกเลิก
              </button>
            </>
          }
        >
          <div className="ldg-form">
            <div className="adm-field">
              <label>เหตุผล</label>
              <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="เช่น บันทึกยอดผิด / ซ้ำกับ PV-2569-0003" autoFocus />
            </div>
            {voiding.kind === 'refund' && voiding.booking_id && (
              <p className="adm-notice is-warn" style={{ margin: 0 }}>
                สถานะการจองไม่ย้อนกลับเอง — ถ้าต้องคืนที่นั่ง ให้แก้ที่หน้าเช็คชื่อของรอบ
              </p>
            )}
          </div>
        </AdminSheet>
      )}

      {catsOpen && <CategoriesSheet onClose={() => setCatsOpen(false)} />}
    </>
  );
}

/** Admin's own list of expense categories: add, rename, hide. Never deleted —
 *  old rows keep their category. */
function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [name, setName] = useState('');

  const load = () =>
    fetch('/api/admin/expense-categories')
      .then(async (r) => ((await r.json()) as { items?: Cat[] }).items || [])
      .then(setCats)
      .catch(() => setCats([]));
  useEffect(() => {
    load();
  }, []);

  async function save(body: { id?: string; name?: string; active?: boolean }) {
    const r = await fetch('/api/admin/expense-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = (await r.json()) as { error?: string };
    if (!r.ok) return adminAlert('บันทึกไม่ได้', d.error);
    load();
  }

  return (
    <AdminSheet open onClose={onClose} eyebrow="admin · ledger" title="หมวดค่าใช้จ่าย" sub="ซ่อนหมวดที่ไม่ใช้แล้วได้ รายการเดิมยังอยู่ในหมวดนั้น" width={480}>
      <div className="ldg-form">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อหมวดใหม่" style={{ flex: 1 }} />
          <button
            type="button"
            className="adm-btn teal"
            disabled={!name.trim()}
            onClick={async () => {
              await save({ name });
              setName('');
            }}
          >
            เพิ่ม
          </button>
        </div>
        {cats === null ? (
          <PageLoader />
        ) : (
          cats.map((c) => (
            <div key={c.id} className="ldg-cat" style={{ opacity: c.active ? 1 : 0.5 }}>
              <input
                defaultValue={c.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) save({ id: c.id, name: v });
                }}
              />
              <button type="button" className="adm-btn" onClick={() => save({ id: c.id, active: !c.active })}>
                {c.active ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
          ))
        )}
      </div>
    </AdminSheet>
  );
}
