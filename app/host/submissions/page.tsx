'use client';

/**
 * กิจกรรมของฉัน — a host makes their own single or round activity, saves it
 * as a draft, sends it to the team and follows what admin decided
 * (api/teacher/submissions, migration 080). The forms are admin's own, in
 * host mode: admin-only fields are left out and saves go to the host API.
 */
import '@/app/admin/admin.css';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import { WorkshopForm, formValuesFromWorkshop, emptyWorkshopForm, type WorkshopFormValues } from '@/app/admin/workshops/_components/WorkshopForm';
import { MasterForm } from '@/app/admin/workshop-info/_components/MasterForm';
import { REVIEW_LABEL, GATED_LABEL, type ReviewStatus } from '@/lib/submission-labels';
import type { SubmissionRow } from '@/app/api/teacher/submissions/route';
import type { Workshop, WorkshopMaster } from '@/lib/types';
import type { VerificationRow, VerifyData } from '@/lib/verification-labels';
import { VerifyPanel } from './VerifyPanel';
import { PostponeModal } from './PostponeModal';

type Ver = { canPublish: boolean; verification: VerificationRow | null; prefill: Partial<VerifyData> };

type Modal =
  | { kind: 'single'; id?: string; initial: WorkshopFormValues }
  | { kind: 'round'; id?: string; initial: WorkshopMaster | null }
  | null;

const TONE: Record<ReviewStatus, { bg: string; fg: string }> = {
  draft: { bg: '#eceeed', fg: '#4c5755' },
  pending: { bg: '#fdf1d3', fg: '#7a5200' },
  changes_requested: { bg: '#fde7d3', fg: '#a04a14' },
  approved: { bg: '#eaf6f4', fg: '#075a51' },
  rejected: { bg: '#fde4e1', fg: '#a3261a' },
};

/** "4 พ.ย. 69" from a YYYY-MM-DD day or a UTC "YYYY-MM-DD HH:MM:SS" stamp. */
function fmtDay(d: string | null): string {
  if (!d) return '';
  const t = d.length <= 10 ? new Date(`${d}T00:00:00`) : new Date(`${d.replace(' ', 'T')}Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function HostSubmissionsPage() {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [ver, setVer] = useState<Ver | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/teacher/verification')
      .then(async (r) => {
        const d = (await r.json()) as Ver & { error?: string };
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setVer(d);
        // Only a host admin let publish on their own has a list to load.
        if (!d.canPublish) return;
        const s = await fetch('/api/teacher/submissions');
        const j = (await s.json()) as { submissions?: SubmissionRow[]; error?: string };
        if (!s.ok) throw new Error(j.error || `HTTP ${s.status}`);
        setRows(j.submissions || []);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function openEdit(s: SubmissionRow) {
    setBusy(s.id);
    try {
      const r = await fetch(`/api/teacher/submissions/${s.kind}/${s.id}`);
      const d = (await r.json()) as { row?: Workshop | WorkshopMaster; error?: string };
      if (!r.ok || !d.row) return setNote(d.error || 'โหลดกิจกรรมไม่สำเร็จ');
      setModal(
        s.kind === 'single'
          ? { kind: 'single', id: s.id, initial: formValuesFromWorkshop(d.row as Workshop) }
          : { kind: 'round', id: s.id, initial: d.row as WorkshopMaster },
      );
    } finally {
      setBusy(null);
    }
  }

  async function act(s: SubmissionRow, what: 'submit' | 'cancel') {
    if (what === 'cancel' && !window.confirm(`ยกเลิก "${s.title}"? กิจกรรมจะถูกปิดไว้ (ไม่ได้ลบ) — เปิดใหม่ไม่ได้ ต้องสร้างใหม่`)) return;
    setBusy(s.id);
    setNote(null);
    try {
      const r = await fetch(`/api/teacher/submissions/${s.kind}/${s.id}/${what}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(what === 'cancel' ? { action: 'cancel' } : {}),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) return setNote(d.error || 'ทำรายการไม่สำเร็จ');
      setNote(what === 'submit' ? `ส่ง "${s.title}" ให้ทีมตรวจแล้ว — จะแจ้งผลทาง LINE` : 'ยกเลิกแล้ว — กิจกรรมถูกปิดไว้');
      load();
    } finally {
      setBusy(null);
    }
  }

  function saved(isNewRound: boolean) {
    setModal(null);
    load();
    setNote(isNewRound ? 'บันทึกแล้ว — ต่อไปกด “จัดรอบ” เพื่อเพิ่มรอบ แล้วกลับมากด “ส่งให้ทีมตรวจ”' : 'บันทึกแล้ว');
  }

  if (ver && !ver.canPublish) {
    return (
      <div>
        <div className="tdb-head">
          <div>
            <span className="tdb-eyebrow">กิจกรรมของฉัน</span>
            <h1 className="tdb-h1">สร้าง &amp; ส่งกิจกรรม.</h1>
          </div>
        </div>
        <VerifyPanel verification={ver.verification} prefill={ver.prefill} onSent={load} />
      </div>
    );
  }

  return (
    <div>
      <div className="tdb-head">
        <div>
          <span className="tdb-eyebrow">กิจกรรมของฉัน</span>
          <h1 className="tdb-h1">สร้าง &amp; ส่งกิจกรรม.</h1>
          <p className="tdb-lead">สร้างกิจกรรมเอง บันทึกเป็นร่าง แล้วส่งให้ทีมตรวจ — อนุมัติแล้วกิจกรรมจึงขึ้นบนเว็บ</p>
        </div>
        <div className="tdb-sub-new">
          <button type="button" className="tdb-sub-btn ink" onClick={() => setModal({ kind: 'single', initial: emptyWorkshopForm })}>
            + กิจกรรมเดี่ยว
          </button>
          <button type="button" className="tdb-sub-btn" onClick={() => setModal({ kind: 'round', initial: null })}>
            + กิจกรรมจองรอบ
          </button>
        </div>
      </div>

      {note && (
        <div className="tdb-sub-flash" role="status">
          {note}
        </div>
      )}

      {err ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>โหลดไม่สำเร็จ: {err}</p>
      ) : rows === null ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <div className="tdb-empty">
          <h3>ยังไม่มีกิจกรรมที่สร้างเอง</h3>
          <p>กด “+ กิจกรรมเดี่ยว” สำหรับกิจกรรมที่จัดครั้งเดียว หรือ “+ กิจกรรมจองรอบ” สำหรับกิจกรรมที่เปิดหลายรอบให้เลือกจอง</p>
        </div>
      ) : (
        <div className="tdb-sub-list">
          {rows.map((s) => {
            const st = s.review_status as ReviewStatus;
            const live = s.live_status !== 'draft';
            const waiting = s.pending_json ? Object.keys(JSON.parse(s.pending_json) as object).map((k) => GATED_LABEL[k] || k) : [];
            const canSend = live ? waiting.length > 0 && st === 'changes_requested' : st !== 'pending' && st !== 'approved';
            const tone = TONE[st] || TONE.draft;
            const locked = s.booked > 0;
            const gone = s.live_status === 'cancelled' || s.live_status === 'archived';
            return (
              <article key={`${s.kind}-${s.id}`} className="tdb-sub">
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt="" className="tdb-sub-img" />
                ) : (
                  <div className="tdb-sub-img is-empty">{s.kind === 'round' ? 'จองรอบ' : 'เดี่ยว'}</div>
                )}
                <div className="tdb-sub-body">
                  <div className="tdb-sub-tags">
                    {gone ? (
                      <span className="tdb-sub-pill" style={{ background: '#eceeed', color: '#4c5755' }}>
                        ยกเลิกแล้ว
                      </span>
                    ) : (
                      <span className="tdb-sub-pill" style={{ background: tone.bg, color: tone.fg }}>
                        {live && st === 'pending' ? 'รออนุมัติการแก้ไข' : REVIEW_LABEL[st] || st}
                      </span>
                    )}
                    <span className="tdb-sub-kind">{s.kind === 'round' ? 'กิจกรรมจองรอบ' : 'กิจกรรมเดี่ยว'}</span>
                    {live && !gone && <span className="tdb-sub-kind">เปิดบนเว็บแล้ว</span>}
                  </div>
                  <h3 className="tdb-sub-title">{s.title}</h3>
                  <p className="tdb-sub-meta">
                    {s.date ? `จัดวันที่ ${fmtDay(s.date)} · ` : ''}
                    {s.submitted_at ? `ส่งตรวจ ${fmtDay(s.submitted_at)}` : 'ยังไม่ได้ส่งตรวจ'}
                    {s.reviewed_at ? ` · ตรวจแล้ว ${fmtDay(s.reviewed_at)}` : ''}
                  </p>
                  {waiting.length > 0 && <p className="tdb-sub-meta">รออนุมัติ: {waiting.join(', ')} — หน้าเว็บยังใช้ค่าเดิมจนกว่าทีมงานจะอนุมัติ</p>}
                  {locked && !gone && (
                    <p className="tdb-sub-meta">
                      มีผู้จองแล้ว {s.booked} คน — แก้ไขเองไม่ได้ หากต้องแก้ติดต่อทีมงาน{s.kind === 'single' ? ' · เลื่อนวันหรือยกเลิกได้ที่ปุ่ม “เลื่อน / ยกเลิก”' : ' · ยกเลิกหรือย้ายรอบได้ที่หน้าจัดรอบ'}
                    </p>
                  )}
                  {s.review_note && st !== 'pending' && (
                    <p className="tdb-sub-note">
                      <b>หมายเหตุจากทีมงาน:</b> {s.review_note}
                    </p>
                  )}
                  {!gone && (
                  <div className="tdb-sub-acts">
                    <button type="button" className="tdb-sub-btn" disabled={busy === s.id || locked} onClick={() => openEdit(s)}>
                      {locked ? 'มีผู้จองแล้ว · แก้ไม่ได้' : 'แก้ไข'}
                    </button>
                    {s.kind === 'round' && (
                      <Link href={`/host/sessions/${s.id}`} className="tdb-sub-btn">
                        จัดรอบ
                      </Link>
                    )}
                    {live && s.kind === 'single' && (
                      <Link href={`/journeys/${s.id}`} className="tdb-sub-btn" target="_blank">
                        ดูหน้ากิจกรรม
                      </Link>
                    )}
                    {canSend && (
                      <button type="button" className="tdb-sub-btn ink" disabled={busy === s.id} onClick={() => act(s, 'submit')}>
                        ส่งให้ทีมตรวจ
                      </button>
                    )}
                    {s.kind === 'single' && locked ? (
                      <button type="button" className="tdb-sub-btn danger" disabled={busy === s.id} onClick={() => setMoving(s.id)}>
                        เลื่อน / ยกเลิก
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tdb-sub-btn danger"
                        disabled={busy === s.id || locked}
                        title={locked ? 'ยังมีรอบที่มีคนจอง — ยกเลิกหรือย้ายรอบนั้นที่หน้าจัดรอบก่อน' : undefined}
                        onClick={() => act(s, 'cancel')}
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {moving && (
        <PostponeModal
          id={moving}
          onClose={() => setMoving(null)}
          onDone={(msg) => {
            setMoving(null);
            setNote(msg);
            load();
          }}
        />
      )}

      {/* The admin form styles (admin.css) are scoped to .adm. */}
      <div className="adm adm-host-forms">
        <AdminFormModal
          eyebrow="host"
          open={modal !== null}
          title={modal?.id ? 'แก้ไขกิจกรรม' : modal?.kind === 'round' ? 'สร้างกิจกรรมจองรอบ' : 'สร้างกิจกรรมเดี่ยว'}
          subtitle={modal?.kind === 'round' ? 'ข้อมูล ราคา และสถานที่ — เพิ่มรอบที่หน้า “จัดรอบ” หลังบันทึก' : 'บันทึกเป็นร่างก่อน แล้วกดส่งให้ทีมตรวจจากรายการ'}
          onClose={() => setModal(null)}
        >
          {modal?.kind === 'single' && (
            <WorkshopForm key={modal.id || 'new'} host initial={modal.initial} editingId={modal.id} onSuccess={() => saved(false)} onCancel={() => setModal(null)} />
          )}
          {modal?.kind === 'round' && (
            <MasterForm key={modal.id || 'new'} host kind="round" initial={modal.initial} editingId={modal.id} onSuccess={() => saved(!modal.id)} onCancel={() => setModal(null)} />
          )}
        </AdminFormModal>
      </div>
    </div>
  );
}
