'use client';

/**
 * รออนุมัติ — activities hosts made themselves (migration 080), and the price
 * or date edits waiting on ones already live. Admin checks, may fix them in
 * the usual forms, then approves, sends back with a note, or turns them
 * down; the host hears on LINE (api/admin/submissions). The second tab holds
 * hosts asking to publish on their own (migration 081): admin phones them,
 * then approves, which grants the self_publisher role.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminChips, AdminHead, Badge, adminAlert, adminToast, type Tone } from '@/components/admin/AdminShell';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import { WorkshopForm, formValuesFromWorkshop, type WorkshopFormValues } from '@/app/admin/workshops/_components/WorkshopForm';
import { MasterForm } from '@/app/admin/workshop-info/_components/MasterForm';
import { GATED_LABEL, REVIEW_LABEL, type ReviewStatus } from '@/lib/submission-labels';
import type { AdminSubmission, AdminVerification } from '@/app/api/admin/submissions/route';
import { VERIFY_FIELDS, VERIFY_LABEL, VERIFY_STATUS_LABEL } from '@/lib/verification-labels';
import { accountNameMismatch } from '@/lib/host-payout';
import { useFocusTokens } from '@/components/admin/AlertFocus';
import type { Workshop, WorkshopMaster } from '@/lib/types';

type Filter = 'pending' | 'changes_requested' | 'rejected';
type Modal = { kind: 'single'; id: string; initial: WorkshopFormValues } | { kind: 'round'; id: string; initial: WorkshopMaster } | null;
type Decide =
  | { s: AdminSubmission; ver?: undefined; action: 'changes' | 'reject' }
  | { ver: AdminVerification; s?: undefined; action: 'changes' | 'reject' }
  | null;
type Tab = 'activities' | 'hosts';

const TONE: Record<ReviewStatus, Tone> = { draft: 'mute', pending: 'warn', changes_requested: 'info', approved: 'ok', rejected: 'bad' };

function fmtStamp(d: string | null): string {
  if (!d) return '—';
  const t = new Date(`${d.replace(' ', 'T')}Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** A waiting value as words: prices in baht, lists joined, empty as "—". */
function fmtValue(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'price_tiers' && Array.isArray(v)) return v.map((t: { label?: string; price?: number }) => `${t.label || ''} ฿${Number(t.price || 0).toLocaleString()}`).join(', ');
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? Object.values(x as object).join(' ') : String(x))).join(', ');
  if (typeof v === 'number' && /price|amount/.test(k)) return `฿${v.toLocaleString()}`;
  return String(v);
}

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<AdminSubmission[] | null>(null);
  const [vers, setVers] = useState<AdminVerification[]>([]);
  const focus = useFocusTokens();
  const [tab, setTab] = useState<Tab>(focus.some((t) => t.startsWith('ver:')) ? 'hosts' : 'activities');
  const [filter, setFilter] = useState<Filter>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [decide, setDecide] = useState<Decide>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    fetch('/api/admin/submissions')
      .then((r) => (r.ok ? (r.json() as Promise<{ submissions: AdminSubmission[]; verifications?: AdminVerification[] }>) : null))
      .then((d) => {
        setRows(d?.submissions || []);
        setVers(d?.verifications || []);
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function send(s: AdminSubmission, action: 'approve' | 'changes' | 'reject', text = '') {
    setBusy(s.id);
    try {
      const r = await fetch(`/api/admin/submissions/${s.kind}/${s.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: text }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) return adminAlert('ทำรายการไม่สำเร็จ', d.error || 'เกิดข้อผิดพลาด');
      adminToast(action === 'approve' ? 'อนุมัติแล้ว — แจ้งผู้จัดทาง LINE' : action === 'changes' ? 'ส่งกลับให้ผู้จัดแก้แล้ว' : 'ไม่อนุมัติแล้ว');
      setDecide(null);
      setNote('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function sendVer(v: AdminVerification, action: 'approve' | 'changes' | 'reject', text = '') {
    setBusy(v.user_id);
    try {
      const r = await fetch(`/api/admin/verifications/${v.user_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note: text }) });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) return adminAlert('ทำรายการไม่สำเร็จ', d.error || 'เกิดข้อผิดพลาด');
      adminToast(action === 'approve' ? 'อนุมัติแล้ว — ผู้จัดลงกิจกรรมเองได้ แจ้งทาง LINE แล้ว' : action === 'changes' ? 'ส่งกลับให้ผู้จัดแก้แล้ว' : 'ไม่อนุมัติแล้ว');
      setDecide(null);
      setNote('');
      load();
    } finally {
      setBusy(null);
    }
  }

  function approveVer(v: AdminVerification) {
    if (!window.confirm(`อนุมัติ ${v.full_name}? ผู้จัดจะสร้างกิจกรรมเองได้ และข้อมูลบัญชีจะถูกบันทึกในหน้าบัญชีผู้จัด`)) return;
    void sendVer(v, 'approve');
  }

  async function openEdit(s: AdminSubmission) {
    setBusy(s.id);
    try {
      if (s.kind === 'single') {
        const r = await fetch(`/api/workshops/${s.id}`);
        const d = (await r.json()) as { workshop?: Workshop };
        if (!r.ok || !d.workshop) return adminAlert('โหลดกิจกรรมไม่สำเร็จ');
        setModal({ kind: 'single', id: s.id, initial: formValuesFromWorkshop(d.workshop) });
      } else {
        const r = await fetch('/api/workshop-masters');
        const d = (await r.json()) as { masters?: WorkshopMaster[] };
        const m = (d.masters || []).find((x) => x.id === s.id);
        if (!m) return adminAlert('โหลดกิจกรรมไม่สำเร็จ');
        setModal({ kind: 'round', id: s.id, initial: m });
      }
    } finally {
      setBusy(null);
    }
  }

  const done = () => {
    setModal(null);
    adminToast('บันทึกแล้ว');
    load();
  };

  const all = rows || [];
  const shown = all.filter((r) => r.review_status === filter);
  const count = (f: Filter) => (tab === 'hosts' ? vers.filter((v) => v.status === f).length : all.filter((r) => r.review_status === f).length);
  const shownVer = vers.filter((v) => v.status === filter);
  const waitingSubs = all.filter((r) => r.review_status === 'pending').length;
  const waitingVers = vers.filter((v) => v.status === 'pending').length;

  return (
    <>
      <AdminHead eyebrow="admin · submissions" title="รออนุมัติ" sub="กิจกรรมที่ผู้จัดสร้างเอง และการแก้ราคา/วันเวลาของกิจกรรมที่เปิดแล้ว — อนุมัติแล้วจึงขึ้นบนเว็บ" />

      <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <AdminChips
          value={tab}
          onChange={setTab}
          items={[
            { key: 'activities', label: 'กิจกรรม', n: waitingSubs },
            { key: 'hosts', label: 'ยืนยันผู้จัด', n: waitingVers },
          ]}
        />
        <AdminChips
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'pending', label: 'รออนุมัติ', n: count('pending') },
            { key: 'changes_requested', label: 'ส่งกลับให้แก้', n: count('changes_requested') },
            { key: 'rejected', label: 'ไม่อนุมัติ', n: count('rejected') },
          ]}
        />
      </div>

      {tab === 'hosts' &&
        (rows === null ? (
          <p className="adm-meta">กำลังโหลด…</p>
        ) : shownVer.length === 0 ? (
          <div className="adm-card adm-empty">{filter === 'pending' ? 'ไม่มีผู้จัดรอยืนยันข้อมูล ✺' : 'ไม่มีรายการ'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shownVer.map((v) => {
              const st = v.status;
              const tel = (v.phone || '').replace(/[^0-9+]/g, '');
              const mismatch = accountNameMismatch(v.full_name, v.account_name);
              return (
                <article key={v.user_id} className="adm-card adm-subm" data-focus={`ver:${v.user_id}`}>
                  <div className="adm-subm-body">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge tone={st === 'pending' ? 'warn' : st === 'changes_requested' ? 'info' : 'bad'}>{VERIFY_STATUS_LABEL[st]}</Badge>
                      <Badge tone="mute">ขอลงกิจกรรมเอง</Badge>
                    </div>
                    <h3 className="adm-subm-title">
                      {v.full_name} {v.nickname ? `(${v.nickname})` : ''}
                    </h3>
                    <p className="adm-meta" style={{ margin: 0 }}>
                      บัญชี {v.account_name_user || '—'} · {v.account_email || '—'} · ส่ง {fmtStamp(v.submitted_at)}
                    </p>
                    <dl className="adm-ver-dl">
                      {VERIFY_FIELDS.filter((k) => k !== 'full_name' && k !== 'nickname' && v[k]).map((k) => (
                        <div key={k} className={k === 'about' ? 'is-wide' : undefined}>
                          <dt>{VERIFY_LABEL[k]}</dt>
                          <dd>
                            {k === 'phone' && tel ? (
                              <a href={`tel:${tel}`}>{v[k]}</a>
                            ) : /^https?:\/\//i.test(v[k] || '') ? (
                              <a href={v[k]} target="_blank" rel="noopener noreferrer">
                                {v[k]} ↗
                              </a>
                            ) : (
                              v[k]
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {mismatch && <p className="adm-hint" style={{ margin: 0, color: '#a04a14' }}>ชื่อบัญชีไม่ตรงกับชื่อจริง — ถามตอนโทรคุย</p>}
                    {v.review_note && <p className="adm-meta" style={{ margin: 0 }}>หมายเหตุล่าสุด: {v.review_note}</p>}
                    <div className="adm-subm-acts">
                      {tel && (
                        <a href={`tel:${tel}`} className="adm-btn sm white">
                          โทร {v.phone}
                        </a>
                      )}
                      {st !== 'rejected' && (
                        <>
                          <button type="button" className="adm-btn sm" disabled={busy === v.user_id} onClick={() => setDecide({ ver: v, action: 'changes' })}>
                            ขอให้แก้
                          </button>
                          <button type="button" className="adm-btn sm danger" disabled={busy === v.user_id} onClick={() => setDecide({ ver: v, action: 'reject' })}>
                            ไม่อนุมัติ
                          </button>
                        </>
                      )}
                      {st === 'pending' && (
                        <button type="button" className="adm-btn sm teal" disabled={busy === v.user_id} onClick={() => approveVer(v)}>
                          โทรคุยแล้ว · อนุมัติ
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

      {tab === 'hosts' ? null : rows === null ? (
        <p className="adm-meta">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <div className="adm-card adm-empty">{filter === 'pending' ? 'ไม่มีกิจกรรมรออนุมัติ ✺' : 'ไม่มีรายการ'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map((s) => {
            const live = s.live_status !== 'draft';
            const pending = s.pending_json ? (JSON.parse(s.pending_json) as Record<string, unknown>) : null;
            const st = s.review_status as ReviewStatus;
            const noRounds = s.kind === 'round' && !live && s.rounds === 0;
            return (
              <article key={`${s.kind}-${s.id}`} className="adm-card adm-subm" data-focus={`sub:${s.kind}:${s.id}`}>
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt="" className="adm-subm-img" />
                ) : (
                  <div className="adm-subm-img is-empty">ไม่มีโปสเตอร์</div>
                )}
                <div className="adm-subm-body">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge tone={TONE[st] || 'mute'}>{live && st === 'pending' ? 'ขอแก้ราคา/วันเวลา' : REVIEW_LABEL[st] || st}</Badge>
                    <Badge tone="mute">{s.kind === 'round' ? `จองรอบ · ${s.rounds} รอบ` : 'กิจกรรมเดี่ยว'}</Badge>
                    {live && <Badge tone="ok">เปิดบนเว็บแล้ว</Badge>}
                  </div>
                  <h3 className="adm-subm-title">{s.title}</h3>
                  <p className="adm-meta" style={{ margin: 0 }}>
                    ผู้จัด {s.host_name || '—'} · ส่ง {fmtStamp(s.submitted_at)}
                    {s.date ? ` · จัดวันที่ ${s.date}` : ''}
                  </p>
                  {pending && (
                    <div className="adm-notice" style={{ margin: '4px 0 0' }}>
                      <b>รอการอนุมัติ (หน้าเว็บยังใช้ค่าเดิม):</b>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {Object.entries(pending).map(([k, v]) => (
                          <li key={k}>
                            {GATED_LABEL[k] || k}: {fmtValue(k, v)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.review_note && <p className="adm-meta" style={{ margin: 0 }}>หมายเหตุล่าสุด: {s.review_note}</p>}
                  <div className="adm-subm-acts">
                    {s.kind === 'single' ? (
                      <Link href={`/journeys/${s.id}`} target="_blank" className="adm-btn sm white">
                        ดูหน้ากิจกรรม ↗
                      </Link>
                    ) : (
                      <Link href={`/admin/workshop-info?focus=${encodeURIComponent(`master:${s.id}`)}`} className="adm-btn sm white">
                        ดูรอบ
                      </Link>
                    )}
                    <button type="button" className="adm-btn sm white" disabled={busy === s.id} onClick={() => openEdit(s)}>
                      แก้เอง
                    </button>
                    {st !== 'rejected' && (
                      <>
                        <button type="button" className="adm-btn sm" disabled={busy === s.id} onClick={() => setDecide({ s, action: 'changes' })}>
                          ขอให้แก้
                        </button>
                        <button type="button" className="adm-btn sm danger" disabled={busy === s.id} onClick={() => setDecide({ s, action: 'reject' })}>
                          ไม่อนุมัติ
                        </button>
                      </>
                    )}
                    {st !== 'changes_requested' && (
                      <button type="button" className="adm-btn sm teal" disabled={busy === s.id || noRounds} onClick={() => send(s, 'approve')}>
                        อนุมัติ
                      </button>
                    )}
                  </div>
                  {noRounds && <p className="adm-hint" style={{ margin: 0 }}>ยังไม่มีรอบ — รอผู้จัดเพิ่มรอบก่อนอนุมัติ</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {decide && (
        <div className="adm-dlg-scrim" onClick={() => setDecide(null)}>
          <div className="adm-dlg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>
              {decide.action === 'changes' ? 'ขอให้ผู้จัดแก้' : 'ไม่อนุมัติ'}: {decide.s ? decide.s.title : decide.ver.full_name}
            </h3>
            <p>
              {decide.action === 'changes'
                ? 'บอกผู้จัดว่าต้องแก้อะไร ข้อความนี้ส่งไปทาง LINE และแสดงในหน้ากิจกรรมของผู้จัด'
                : decide.ver
                  ? 'ผู้จัดคนนี้จะลงกิจกรรมเองไม่ได้ และส่งใบยืนยันใหม่ไม่ได้'
                  : decide.s.live_status !== 'draft'
                  ? 'การแก้ไขจะถูกยกเลิก กิจกรรมยังเปิดอยู่ด้วยค่าเดิม'
                  : 'กิจกรรมนี้จะไม่ขึ้นบนเว็บ ผู้จัดยังเห็นและแก้ส่งใหม่ได้'}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={decide.action === 'changes' ? 'เช่น รูปปกไม่ชัด ขอรูปใหม่ · เพิ่มรายละเอียดสิ่งที่ได้รับ' : 'เหตุผล (ไม่บังคับ)'}
              style={{ width: '100%', marginBottom: 16 }}
              autoFocus
            />
            <div className="adm-dlg-acts">
              <button type="button" className="adm-btn" onClick={() => setDecide(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className={`adm-btn ${decide.action === 'reject' ? 'danger' : 'teal'}`}
                disabled={busy === (decide.s ? decide.s.id : decide.ver.user_id) || (decide.action === 'changes' && !note.trim())}
                onClick={() => (decide.s ? send(decide.s, decide.action, note) : sendVer(decide.ver, decide.action, note))}
              >
                {decide.action === 'changes' ? 'ส่งกลับให้แก้' : 'ไม่อนุมัติ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminFormModal open={modal !== null} title="แก้ไขก่อนอนุมัติ" subtitle="บันทึกแล้วยังต้องกดอนุมัติแยก" onClose={() => setModal(null)}>
        {modal?.kind === 'single' && <WorkshopForm key={modal.id} initial={modal.initial} editingId={modal.id} onSuccess={done} onCancel={() => setModal(null)} />}
        {modal?.kind === 'round' && <MasterForm key={modal.id} kind="round" initial={modal.initial} editingId={modal.id} onSuccess={done} onCancel={() => setModal(null)} />}
      </AdminFormModal>
    </>
  );
}
