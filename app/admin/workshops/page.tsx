'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DayTime, Location, Workshop, ApplicationQuestion } from '@/lib/types';
import { parseImageMeta } from '@/lib/image-meta';
import { parseSchedule, parseInstructorIds } from '@/lib/workshop-utils';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import {
  WorkshopForm,
  emptyWorkshopForm,
  type WorkshopFormValues,
} from './_components/WorkshopForm';
import { ApplicationFormBuilder } from './_components/ApplicationFormBuilder';
import { PayoutManager } from './_components/PayoutManager';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; id: string; initial: WorkshopFormValues; title: string }
  | { mode: 'application'; id: string; title: string; questions: ApplicationQuestion[] }
  | { mode: 'payout'; id: string; title: string; workshop: Workshop }
  | null;

function safeParseArray<T>(json: string | null | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminWorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);

  async function fetchAll() {
    setLoadError(false);
    try {
      const [wsRes, locRes] = await Promise.all([
        fetch('/api/workshops?counts=1'),
        fetch('/api/locations'),
      ]);
      if (!wsRes.ok || !locRes.ok) throw new Error(`HTTP ${wsRes.status}/${locRes.status}`);
      const wsData = (await wsRes.json()) as { workshops: Workshop[] };
      const locData = (await locRes.json()) as { locations: Location[] };
      setWorkshops(wsData.workshops || []);
      setLocations(locData.locations || []);
    } catch (e) {
      console.error('Failed to load workshops (admin)', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchAll();
    })();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบ Workshop นี้?')) return;
    await fetch(`/api/workshops/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  // Star/feature toggle → Workshop shows in the homepage Hero fan. Optimistic.
  async function toggleFeatured(id: string, next: boolean) {
    setWorkshops((ws) => ws.map((w) => (w.id === id ? { ...w, featured: next ? 1 : 0 } : w)));
    try {
      const res = await fetch(`/api/workshops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      // revert on failure
      setWorkshops((ws) => ws.map((w) => (w.id === id ? { ...w, featured: next ? 0 : 1 } : w)));
    }
  }

  async function openEdit(id: string) {
    setLoadingEdit(id);
    try {
      const res = await fetch(`/api/workshops/${id}`);
      if (!res.ok) {
        alert('โหลด Workshop ไม่สำเร็จ');
        return;
      }
      const data = (await res.json()) as {
        workshop: Workshop & { image_meta?: string | null };
      };
      const w = data.workshop;
      const initial: WorkshopFormValues = {
        title: w.title,
        description: w.description || '',
        short_description: w.short_description || '',
        workshop_type: w.workshop_type || 'one_day',
        date: w.date,
        end_date: w.end_date || '',
        dates: safeParseArray<string>(w.dates_json, []),
        date_input: '',
        time_start: w.time_start,
        time_end: w.time_end,
        dayTimes: safeParseArray<DayTime>(w.day_times_json, []),
        location: w.location || '',
        location_id: w.location_id || '',
        instructor_id: w.instructor_id || '',
        instructor_ids: parseInstructorIds(w),
        scheduleDays: (() => {
          const days = parseSchedule(w.schedule_json);
          return days.length > 0 ? days : [{ label: '', items: [] }];
        })(),
        learn_items: safeParseArray<string>(w.learn_json, []),
        target_items: safeParseArray<string>(w.target_json, []),
        category: w.category || '',
        tags: safeParseArray<string>(w.tags_json, []),
        tag_input: '',
        promo_price: w.promo_price != null ? String(w.promo_price) : '',
        promo_start: w.promo_start || '',
        promo_end: w.promo_end || '',
        theme_color: w.theme_color || '',
        max_participants: w.max_participants,
        min_age: w.min_age != null ? String(w.min_age) : '',
        max_age: w.max_age != null ? String(w.max_age) : '',
        price: w.price,
        image_url: w.image_url || '',
        image_meta: parseImageMeta(w.image_meta),
        status: w.status,
        admission_type: w.admission_type || 'direct',
        payment_type: w.payment_type || 'paid',
        deposit_amount: w.deposit_amount || 0,
        announce_at: w.announce_at || '',
        confirm_main_by: w.confirm_main_by || '',
        confirm_waitlist_by: w.confirm_waitlist_by || '',
        require_consent: !!w.require_consent,
        photos_drive_url: w.photos_drive_url || '',
        master_id: w.master_id || '',
      };
      setModal({ mode: 'edit', id, initial, title: w.title });
    } finally {
      setLoadingEdit(null);
    }
  }

  function closeModal() {
    setModal(null);
    setFormDirty(false);
    setPendingClose(false);
  }

  function closeAndRefresh() {
    closeModal();
    fetchAll();
  }

  // Guard close of the workshop create/edit form when it has unsaved changes.
  function requestClose() {
    if (formDirty) setPendingClose(true);
    else closeModal();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted">
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="border border-primary text-primary rounded-full px-6 py-2 text-sm font-semibold">ลองใหม่</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
            admin · workshops · overview
          </p>
          <h1 className="font-heading text-3xl text-dark">จัดการ Workshop</h1>
          <p className="text-sm text-gray mt-1">ทั้งหมด {workshops.length} รายการ</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="btn-primary text-sm"
        >
          + เพิ่ม Workshop
        </button>
      </header>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-4 text-gray font-medium">ชื่อ</th>
                <th className="text-left py-3 px-4 text-gray font-medium">วันที่</th>
                <th className="text-left py-3 px-4 text-gray font-medium">เวลา</th>
                <th className="text-left py-3 px-4 text-gray font-medium">สถานที่</th>
                <th className="text-left py-3 px-4 text-gray font-medium">ราคา</th>
                <th className="text-left py-3 px-4 text-gray font-medium">สถานะ</th>
                <th className="text-center py-3 px-4 text-gray font-medium">ผู้สมัคร</th>
                <th className="text-right py-3 px-4 text-gray font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {workshops.map((ws) => {
                const loc = locations.find((l) => l.id === ws.location_id);
                return (
                  <tr key={ws.id} className="border-t border-gray-lighter hover:bg-surface/50">
                    <td className="py-3 px-4 text-dark font-medium max-w-[200px] truncate">
                      {ws.title}
                    </td>
                    <td className="py-3 px-4 text-gray">
                      {new Date(ws.date).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-gray">
                      {ws.time_start}-{ws.time_end}
                    </td>
                    <td className="py-3 px-4 text-gray max-w-[180px] truncate">
                      {loc ? `${loc.name} (${loc.province})` : ws.location || '-'}
                    </td>
                    <td className="py-3 px-4 text-dark font-medium">
                      ฿{ws.price.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          ws.status === 'active'
                            ? 'badge-success'
                            : ws.status === 'draft'
                              ? 'badge bg-amber-100 text-amber-700'
                              : 'badge bg-gray-lighter text-gray'
                        }
                      >
                        {ws.status === 'active'
                          ? 'เปิดจอง'
                          : ws.status === 'draft'
                            ? 'แบบร่าง'
                            : 'ปิดรับ'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="text-dark font-semibold">{ws.booking_count ?? 0}</span>
                      <span className="text-gray"> / {ws.max_participants} คน</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFeatured(ws.id, !ws.featured)}
                          aria-pressed={!!ws.featured}
                          title={ws.featured ? 'เอาดาวออก (ไม่แสดงหน้าแรก)' : 'ติดดาว — แสดงในการ์ดหน้าแรก'}
                          className="leading-none"
                          style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: 16, lineHeight: 1, color: ws.featured ? '#f5c243' : '#cbd0cf' }}
                        >
                          {ws.featured ? '★' : '☆'}
                        </button>
                        {ws.admission_type === 'selection' && (
                          <Link
                            href={`/admin/workshops/${ws.id}/applicants`}
                            className="text-dark text-xs font-medium hover:text-primary hover:underline"
                          >
                            ผู้สมัคร
                          </Link>
                        )}
                        <Link
                          href={`/admin/workshops/${ws.id}/attendance`}
                          className="text-dark text-xs font-medium hover:text-primary hover:underline"
                        >
                          เช็คชื่อ
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              mode: 'application',
                              id: ws.id,
                              title: ws.title,
                              questions: safeParseArray<ApplicationQuestion>(ws.application_form, []),
                            })
                          }
                          className="text-dark text-xs font-medium hover:text-primary hover:underline"
                        >
                          ฟอร์มสมัคร
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ mode: 'payout', id: ws.id, title: ws.title, workshop: ws })}
                          className="text-dark text-xs font-medium hover:text-primary hover:underline"
                        >
                          เงินโอน
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(ws.id)}
                          disabled={loadingEdit === ws.id}
                          className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          {loadingEdit === ws.id ? 'กำลังโหลด...' : 'แก้ไข'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ws.id)}
                          className="text-red-500 text-xs font-medium hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {workshops.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray">
                    ยังไม่มี Workshop —{' '}
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'create' })}
                      className="text-primary hover:underline"
                    >
                      เพิ่ม Workshop แรก
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminFormModal
        open={modal !== null}
        title={
          modal?.mode === 'application'
            ? 'ฟอร์มสมัครเวิร์กชอป'
            : modal?.mode === 'payout'
              ? 'จัดการการโอนเงิน (Payout)'
              : modal?.mode === 'edit'
                ? 'แก้ไข Workshop'
                : 'เพิ่ม Workshop ใหม่'
        }
        subtitle={modal && modal.mode !== 'create' ? modal.title : undefined}
        onClose={modal?.mode === 'edit' || modal?.mode === 'create' ? requestClose : () => setModal(null)}
      >
        {modal?.mode === 'edit' ? (
          <WorkshopForm
            key={modal.id}
            initial={modal.initial}
            editingId={modal.id}
            onSuccess={closeAndRefresh}
            onCancel={closeModal}
            onDirtyChange={setFormDirty}
            pendingClose={pendingClose}
            onAttemptClose={requestClose}
            onStay={() => setPendingClose(false)}
          />
        ) : modal?.mode === 'create' ? (
          <WorkshopForm
            key="create"
            initial={emptyWorkshopForm}
            onSuccess={closeAndRefresh}
            onCancel={closeModal}
            onDirtyChange={setFormDirty}
            pendingClose={pendingClose}
            onAttemptClose={requestClose}
            onStay={() => setPendingClose(false)}
          />
        ) : modal?.mode === 'application' ? (
          <ApplicationFormBuilder
            key={`app-${modal.id}`}
            workshopId={modal.id}
            initial={modal.questions}
            onSuccess={closeAndRefresh}
            onCancel={() => setModal(null)}
          />
        ) : modal?.mode === 'payout' ? (
          <PayoutManager
            key={`payout-${modal.id}`}
            workshop={modal.workshop}
            onSuccess={closeAndRefresh}
            onCancel={() => setModal(null)}
          />
        ) : null}
      </AdminFormModal>
    </div>
  );
}
