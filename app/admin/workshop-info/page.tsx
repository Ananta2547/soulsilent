'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Workshop } from '@/lib/types';

type WorkshopRow = Workshop & { booking_count?: number };
import Link from 'next/link';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
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
    if (!confirm(`ลบข้อมูล "${m.title}"? (รอบที่จัดจะยังอยู่ แต่จะไม่ผูกกับข้อมูลนี้)`)) return;
    setBusyId(m.id);
    try {
      await fetch(`/api/workshop-masters/${m.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">ข้อมูล Workshop</h1>
          <p className="text-sm text-gray mt-1">Workshop รอบ = ผู้สอนเปิดรอบเองจากจัดรอบสอน · Workshop เดี่ยว = admin สร้างแต่ละครั้งที่จัดการ Workshop แล้วผูกกับข้อมูลนี้</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create', kind: tab })}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          {tab === 'single' ? '+ เพิ่ม Workshop เดี่ยว' : '+ เพิ่ม Workshop รอบ'}
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-gray-lighter p-1 text-sm w-fit mb-5">
        {([
          ['round', `Workshop รอบ · ${roundMasters.length}`],
          ['single', `Workshop เดี่ยว · ${singleMasters.length}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-md ${tab === k ? 'bg-dark text-white' : 'text-gray hover:bg-surface'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray text-sm">กำลังโหลด…</p>
      ) : loadError ? (
        <p className="text-gray text-sm">
          โหลดข้อมูลไม่สำเร็จ{' '}
          <button onClick={() => { setLoading(true); load(); }} className="underline text-primary">ลองใหม่</button>
        </p>
      ) : shownMasters.length === 0 ? (
        <div className="border border-dashed border-gray-lighter rounded-xl p-10 text-center text-gray text-sm">
          {tab === 'single' ? 'ยังไม่มี Workshop เดี่ยว' : 'ยังไม่มี Workshop รอบ'} —{' '}
          <button type="button" onClick={() => setModal({ mode: 'create', kind: tab })} className="text-primary hover:underline">
            เพิ่มรายการแรก
          </button>
        </div>
      ) : (
        // Cards are poster-wide: as many A3 portraits fit the row as can.
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 260px))' }}>
          {shownMasters.map((m) => (
            <div key={m.id} className="border border-gray-lighter rounded-xl bg-white overflow-hidden">
              {m.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.cover_image_url} alt={m.title} className="w-full aspect-[297/420] object-cover" />
              ) : (
                <div className="w-full aspect-[297/420] bg-surface flex items-center justify-center text-gray text-sm">ไม่มีรูปปก</div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-dark">{m.title}</h3>
                {m.organizer_name && <p className="text-xs text-gray mt-0.5">โดย {m.organizer_name}</p>}
                {m.kind !== 'single' && (
                  <p className="text-xs text-gray mt-1">
                    กลุ่ม {m.price_group != null ? `฿${m.price_group.toLocaleString()}` : '—'} · ส่วนตัว {m.price_private != null ? `฿${m.price_private.toLocaleString()}` : 'ไม่เปิด'}
                  </p>
                )}
                {/* Rounds the teacher has opened under this master. */}
                <button
                  type="button"
                  onClick={() => setOpenMaster((o) => (o === m.id ? null : m.id))}
                  className="mt-2 text-xs text-dark hover:text-primary"
                  aria-expanded={openMaster === m.id}
                >
                  {openMaster === m.id ? '▾' : '▸'} {m.kind === 'single' ? 'workshop' : 'รอบ'} · {roundsOf(m.id).length}
                </button>
                {openMaster === m.id && (
                  <ul className="mt-2 divide-y divide-gray-lighter border border-gray-lighter rounded-lg text-xs">
                    {roundsOf(m.id).length === 0 && (
                      <li className="p-2 text-gray">
                        {m.kind === 'single'
                          ? <>ยังไม่มี workshop — สร้างที่ <Link href="/admin/workshops" className="text-primary hover:underline">จัดการ Workshop</Link> แล้วผูกกับข้อมูลนี้</>
                          : 'ยังไม่มีรอบ — ผู้สอนเปิดได้ที่ Teacher Dashboard → จัดรอบสอน'}
                      </li>
                    )}
                    {roundsOf(m.id).map((w) => (
                      <li key={w.id} className="p-2 flex items-center gap-2">
                        <span className="flex-1 min-w-0">
                          <span className="text-dark">{w.date}</span> · {w.time_start}–{w.time_end}
                          {w.location ? ` · ${w.location}` : ''}
                          {w.status !== 'active' ? ` · ${w.status}` : ''}
                        </span>
                        <span className="text-gray">{w.booking_count ?? 0}/{w.max_participants}</span>
                        <Link href={`/admin/workshops/${w.id}/applicants`} className="text-primary hover:underline">ผู้สมัคร</Link>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs">
                  <Link href={`/workshop-info/${m.id}`} target="_blank" className="text-dark hover:text-primary hover:underline">
                    ดูหน้าจริง ↗
                  </Link>
                  <button type="button" onClick={() => setModal({ mode: 'edit', master: m })} className="text-primary hover:underline">
                    แก้ไข
                  </button>
                  <button type="button" onClick={() => remove(m)} disabled={busyId === m.id} className="text-red-500 hover:underline disabled:opacity-50">
                    {busyId === m.id ? 'กำลังลบ...' : 'ลบ'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminFormModal
        open={modal !== null}
        title={modal?.mode === 'edit' ? 'แก้ไขข้อมูล Workshop' : modal?.kind === 'single' ? 'เพิ่ม Workshop เดี่ยว' : 'เพิ่ม Workshop รอบ'}
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
    </div>
  );
}
