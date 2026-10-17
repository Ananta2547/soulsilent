'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Workshop } from '@/lib/types';
import { parseTiers, tierDesc } from '@/lib/pricing';

type WorkshopRow = Workshop & { booking_count?: number };
import Link from 'next/link';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import { adminConfirm, AdminHead, AdminChips, RowMenu } from '@/components/admin/AdminShell';
import { MasterForm } from './_components/MasterForm';
import type { WorkshopMaster } from '@/lib/types';

// 'single' opens the standalone-workshop form — the same one the workshop
// list uses — so a one-off workshop can be made from here as well.
type Modal = { mode: 'create'; kind: 'round' | 'single' } | { mode: 'edit'; master: WorkshopMaster } | null;

export default function WorkshopInfoAdminPage() {
  const [masters, setMasters] = useState<WorkshopMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Unsaved-changes guard for the create/edit form modal.
  const [formDirty, setFormDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  // Two kinds of workshop live here: rounds a teacher opens under a master,
  // and standalone workshops the admin created on their own (every workshop
  // from before migration 051 is standalone).
  const [tab, setTab] = useState<'round' | 'single'>('round');
  const [workshops, setWorkshops] = useState<WorkshopRow[]>([]);
  const [openMaster, setOpenMaster] = useState<string | null>(null);
  const roundsOf = (masterId: string) => workshops.filter((w) => w.master_id === masterId).sort((a, b) => (a.date + a.time_start).localeCompare(b.date + b.time_start));
  const shownMasters = masters.filter((m) => (tab === 'single' ? m.kind === 'single' : m.kind !== 'single'));
  const roundMasters = masters.filter((m) => m.kind !== 'single');
  const singleMasters = masters.filter((m) => m.kind === 'single');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      fetch('/api/workshops?counts=1')
        .then((r) => (r.ok ? (r.json() as Promise<{ workshops: WorkshopRow[] }>) : { workshops: [] }))
        .then((d) => setWorkshops(d.workshops || []))
        .catch(() => {});
      const res = await fetch('/api/workshop-masters');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { masters: WorkshopMaster[] };
      setMasters(data.masters || []);
    } catch (e) {
      console.error('Failed to load workshop-info', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  function closeModal() {
    setModal(null);
    setFormDirty(false);
    setPendingClose(false);
  }

  function closeAndRefresh() {
    closeModal();
    load();
  }

  // Guard the close of the create/edit form when it has unsaved changes.
  function requestClose() {
    if (formDirty) setPendingClose(true);
    else closeModal();
  }

  async function remove(m: WorkshopMaster) {
    if (!(await adminConfirm({ title: `ลบข้อมูล "${m.title}"?`, msg: 'รอบที่จัดจะยังอยู่ แต่จะไม่ผูกกับข้อมูลนี้', ok: 'ลบข้อมูล', danger: true }))) return;
    setBusyId(m.id);
    try {
      await fetch(`/api/workshop-masters/${m.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AdminHead
        eyebrow="admin · journey info"
        title="ข้อมูลกิจกรรม"
        sub="กิจกรรมแบบรอบ = ผู้จัดเปิดรอบเองจากจัดรอบกิจกรรม · กิจกรรมเดี่ยว = admin สร้างแต่ละครั้งที่จัดการกิจกรรม แล้วผูกกับข้อมูลนี้"
        actions={
          <button type="button" onClick={() => setModal({ mode: 'create', kind: tab })} className="adm-btn teal">
            {tab === 'single' ? '+ เพิ่มกิจกรรมเดี่ยว' : '+ เพิ่มกิจกรรมแบบรอบ'}
          </button>
        }
      />

      <div className="adm-toolbar">
        <AdminChips
          value={tab}
          onChange={setTab}
          items={[
            { key: 'round', label: 'กิจกรรมแบบรอบ', n: roundMasters.length },
            { key: 'single', label: 'กิจกรรมเดี่ยว', n: singleMasters.length },
          ]}
        />
      </div>

      {loading ? (
        <p className="adm-meta">กำลังโหลด…</p>
      ) : loadError ? (
        <div className="adm-card adm-empty">
          <p style={{ margin: '0 0 12px' }}>โหลดข้อมูลไม่สำเร็จ</p>
          <button type="button" className="adm-btn sm" onClick={() => { setLoading(true); load(); }}>
            ลองใหม่
          </button>
        </div>
      ) : shownMasters.length === 0 ? (
        <div className="adm-card adm-empty">
          <p style={{ margin: '0 0 12px' }}>{tab === 'single' ? 'ยังไม่มีกิจกรรมเดี่ยว' : 'ยังไม่มีกิจกรรมแบบรอบ'}</p>
          <button type="button" onClick={() => setModal({ mode: 'create', kind: tab })} className="adm-btn sm teal">
            เพิ่มรายการแรก
          </button>
        </div>
      ) : (
        // Cards are poster-wide: as many A3 portraits fit the row as can.
        <div className="adm-posters">
          {shownMasters.map((m) => {
            const rounds = roundsOf(m.id);
            const open = openMaster === m.id;
            return (
              <article key={m.id} className="adm-card adm-poster">
                {m.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.cover_image_url} alt={m.title} className="adm-poster-img" />
                ) : (
                  <div className="adm-poster-img is-empty">poster · a3</div>
                )}
                <div className="adm-poster-body">
                  <h3>{m.title}</h3>
                  {m.organizer_name && <p className="adm-meta">โดย {m.organizer_name}</p>}
                  {m.kind !== 'single' && (
                    <p className="adm-meta">
                      ราคา/คน {m.price_group != null ? `฿${m.price_group.toLocaleString()}` : '—'}
                      {parseTiers(m.price_tiers_json).map((t) => ` · ${t.label} ฿${t.price.toLocaleString()} (${tierDesc(t)})`).join('')}
                    </p>
                  )}
                  {/* Rounds the teacher has opened under this master. */}
                  <button type="button" onClick={() => setOpenMaster((o) => (o === m.id ? null : m.id))} className="adm-poster-toggle" aria-expanded={open}>
                    {open ? '▾' : '▸'} {m.kind === 'single' ? 'กิจกรรม' : 'รอบ'} · {rounds.length}
                  </button>
                  {open && (
                    <div className="adm-rounds">
                      {rounds.length === 0 && (
                        <div className="adm-round adm-meta">
                          {m.kind === 'single' ? (
                            <span>
                              ยังไม่มีกิจกรรม — สร้างที่ <Link href="/admin/workshops">กิจกรรม (รอบ)</Link> แล้วผูกกับข้อมูลนี้
                            </span>
                          ) : (
                            'ยังไม่มีรอบ — ผู้จัดเปิดได้ที่ Host Dashboard → จัดรอบกิจกรรม'
                          )}
                        </div>
                      )}
                      {rounds.map((w) => (
                        <Link key={w.id} href={`/admin/workshops/${w.id}/applicants`} className="adm-round">
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>{new Date(w.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                            <br />
                            <span className="adm-meta">
                              {w.time_start}–{w.time_end}
                              {w.location ? ` · ${w.location}` : ''}
                              {w.status !== 'active' ? ` · ${w.status}` : ''}
                            </span>
                          </span>
                          <span className="adm-mono" style={{ fontSize: 12 }}>
                            {w.booking_count ?? 0}/{w.max_participants}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="adm-mcard-acts" style={{ marginTop: 'auto', paddingTop: 10 }}>
                    <button type="button" className="adm-btn sm" onClick={() => setModal({ mode: 'edit', master: m })}>
                      แก้ไข
                    </button>
                    <RowMenu
                      items={[
                        { label: 'ดูหน้าจริง ↗', onClick: () => window.open(`/journey-info/${m.id}`, '_blank', 'noopener') },
                        { label: busyId === m.id ? 'กำลังลบ…' : 'ลบ', danger: true, disabled: busyId === m.id, onClick: () => remove(m) },
                      ]}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AdminFormModal
        open={modal !== null}
        title={modal?.mode === 'edit' ? 'แก้ไขข้อมูลกิจกรรม' : modal?.kind === 'single' ? 'เพิ่มกิจกรรมเดี่ยว' : 'เพิ่มกิจกรรมแบบรอบ'}
        subtitle={modal?.mode === 'edit' ? modal.master.title : undefined}
        onClose={requestClose}
      >
        {modal?.mode === 'edit' ? (
          <MasterForm
            key={modal.master.id}
            editingId={modal.master.id}
            initial={modal.master}
            onSuccess={closeAndRefresh}
            onCancel={closeModal}
            onDirtyChange={setFormDirty}
            pendingClose={pendingClose}
            onStay={() => setPendingClose(false)}
          />
        ) : modal?.mode === 'create' ? (
          <MasterForm
            key={`create-${modal.kind}`}
            kind={modal.kind}
            onSuccess={closeAndRefresh}
            onCancel={closeModal}
            onDirtyChange={setFormDirty}
            pendingClose={pendingClose}
            onStay={() => setPendingClose(false)}
          />
        ) : null}
      </AdminFormModal>
    </>
  );
}
