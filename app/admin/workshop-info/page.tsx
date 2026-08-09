'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import { MasterForm } from './_components/MasterForm';
import type { WorkshopMaster } from '@/lib/types';

type Modal = { mode: 'create' } | { mode: 'edit'; master: WorkshopMaster } | null;

export default function WorkshopInfoAdminPage() {
  const [masters, setMasters] = useState<WorkshopMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
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

  function closeAndRefresh() {
    setModal(null);
    load();
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
          <p className="text-sm text-gray mt-1">ภาพรวมกิจกรรม (Master) แยกจากรอบที่จัดจริง</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          + เพิ่มข้อมูล
        </button>
      </div>

      {loading ? (
        <p className="text-gray text-sm">กำลังโหลด…</p>
      ) : loadError ? (
        <p className="text-gray text-sm">
          โหลดข้อมูลไม่สำเร็จ{' '}
          <button onClick={() => { setLoading(true); load(); }} className="underline text-primary">ลองใหม่</button>
        </p>
      ) : masters.length === 0 ? (
        <div className="border border-dashed border-gray-lighter rounded-xl p-10 text-center text-gray text-sm">
          ยังไม่มีข้อมูล Workshop —{' '}
          <button type="button" onClick={() => setModal({ mode: 'create' })} className="text-primary hover:underline">
            เพิ่มรายการแรก
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {masters.map((m) => (
            <div key={m.id} className="border border-gray-lighter rounded-xl bg-white overflow-hidden">
              {m.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.cover_image_url} alt={m.title} className="w-full max-w-[240px] mx-auto aspect-[297/420] object-cover" />
              ) : (
                <div className="w-full max-w-[240px] mx-auto aspect-[297/420] bg-surface flex items-center justify-center text-gray text-sm">ไม่มีรูปปก</div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-dark">{m.title}</h3>
                {m.organizer_name && <p className="text-xs text-gray mt-0.5">โดย {m.organizer_name}</p>}
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
        title={modal?.mode === 'edit' ? 'แก้ไขข้อมูล Workshop' : 'เพิ่มข้อมูล Workshop'}
        subtitle={modal?.mode === 'edit' ? modal.master.title : undefined}
        onClose={() => setModal(null)}
      >
        {modal?.mode === 'edit' ? (
          <MasterForm key={modal.master.id} editingId={modal.master.id} initial={modal.master} onSuccess={closeAndRefresh} onCancel={() => setModal(null)} />
        ) : modal?.mode === 'create' ? (
          <MasterForm key="create" onSuccess={closeAndRefresh} onCancel={() => setModal(null)} />
        ) : null}
      </AdminFormModal>
    </div>
  );
}
