'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import type { DayTime, Location, Workshop, ApplicationQuestion } from '@/lib/types';
import { parseImageMeta } from '@/lib/image-meta';
import { parseSchedule, parseInstructorIds, parseDashboardAccess, getWorkshopStatusBadge, hasWorkshopEnded } from '@/lib/workshop-utils';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import {
  WorkshopForm,
  emptyWorkshopForm,
  type WorkshopFormValues,
} from './_components/WorkshopForm';
import { ApplicationFormBuilder } from './_components/ApplicationFormBuilder';
import { PayoutManager } from './_components/PayoutManager';
import { adminAlert, adminConfirm, AdminHead, AdminSearch, AdminChips, Badge, RowMenu, type MenuItem, type Tone } from '@/components/admin/AdminShell';

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
  // One-day workshops vs rounds opened under a round master.
  const [kindFilter, setKindFilter] = useState<'all' | 'single' | 'round'>('all');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [query, setQuery] = useState('');

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
      // /admin/workshops?new=1 (the overview's "+ เพิ่มกิจกรรม") opens the form.
      if (new URLSearchParams(window.location.search).get('new') === '1') {
        setModal({ mode: 'create' });
        window.history.replaceState({}, '', '/admin/workshops');
      }
    })();
  }, []);

  async function handleDelete(id: string) {
    if (!(await adminConfirm({ title: 'ลบกิจกรรมนี้?', msg: 'การจองและข้อมูลของรอบนี้จะถูกลบไปด้วย', ok: 'ลบกิจกรรม', danger: true }))) return;
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
        adminAlert('โหลดกิจกรรมไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
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
        is_online: !!w.is_online,
        online_platform: w.online_platform || 'zoom',
        online_platform_other: w.online_platform_other || '',
        online_url: w.online_url || '',
        instructor_id: w.instructor_id || '',
        instructor_ids: parseInstructorIds(w),
        dashboard_access: parseDashboardAccess(w),
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
        close_at: w.close_at || '',
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
        <button onClick={() => { setLoading(true); fetchAll(); }} className="adm-btn white">ลองใหม่</button>
      </div>
    );
  }

  const isRound = (w: Workshop) => w.master_kind === 'round';
  const roundCount = workshops.filter(isRound).length;
  const q = query.trim().toLowerCase();
  const shownWorkshops = workshops
    .filter((w) => (kindFilter === 'all' ? true : kindFilter === 'round' ? isRound(w) : !isRound(w)))
    .filter((w) => {
      if (!q) return true;
      const loc = locations.find((l) => l.id === w.location_id);
      return [w.title, w.location, loc?.name, loc?.province].some((s) => (s || '').toLowerCase().includes(q));
    });
  const KIND_TABS: { key: 'all' | 'single' | 'round'; label: string; n: number }[] = [
    { key: 'all', label: 'ทั้งหมด', n: workshops.length },
    { key: 'single', label: 'กิจกรรมเดี่ยว', n: workshops.length - roundCount },
    { key: 'round', label: 'แบบรอบ', n: roundCount },
  ];

  // What visitors actually see: an active workshop past its close date or
  // start reads "ปิดรับ" on the site too.
  const statusOf = (ws: Workshop): { label: string; tone: Tone } =>
    ws.status === 'draft'
      ? { label: 'แบบร่าง', tone: 'warn' }
      : ws.status === 'cancelled'
        ? { label: 'ยกเลิก', tone: 'bad' }
        : ws.status === 'completed' || hasWorkshopEnded(ws)
          ? { label: 'จบแล้ว', tone: 'info' }
          : getWorkshopStatusBadge(ws).open
            ? { label: 'เปิดจอง', tone: 'ok' }
            : { label: 'ปิดรับ', tone: 'mute' };

  const rowOf = (ws: Workshop) => {
    const loc = locations.find((l) => l.id === ws.location_id);
    const where = loc ? `${loc.name} (${loc.province})` : ws.location || '—';
    const when = `${new Date(ws.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · ${ws.time_start}–${ws.time_end}`;
    const booked = ws.booking_count ?? 0;
    const pct = ws.max_participants ? Math.min(100, (booked / ws.max_participants) * 100) : 0;
    const menu: MenuItem[] = [
      ...(ws.admission_type === 'selection' ? [{ label: 'ผู้สมัคร (คัดเลือก)', href: `/admin/workshops/${ws.id}/applicants` }] : []),
      { label: 'เช็คชื่อ', href: `/admin/workshops/${ws.id}/attendance` },
      { label: 'บัตรเชิญ', href: `/admin/workshops/${ws.id}/invites` },
      {
        label: 'ฟอร์มสมัคร',
        onClick: () =>
          setModal({ mode: 'application', id: ws.id, title: ws.title, questions: safeParseArray<ApplicationQuestion>(ws.application_form, []) }),
      },
      { label: 'เงินโอน (Payout)', onClick: () => setModal({ mode: 'payout', id: ws.id, title: ws.title, workshop: ws }) },
      { label: 'ลบกิจกรรม', danger: true, onClick: () => handleDelete(ws.id) },
    ];
    const star = (
      <button
        type="button"
        onClick={() => toggleFeatured(ws.id, !ws.featured)}
        aria-pressed={!!ws.featured}
        title={ws.featured ? 'เอาดาวออก (ไม่แสดงหน้าแรก)' : 'ติดดาว — แสดงในการ์ดหน้าแรก'}
        className={`adm-star${ws.featured ? ' is-on' : ''}`}
      >
        {ws.featured ? '★' : '☆'}
      </button>
    );
    const edit = (
      <button type="button" className="adm-btn sm" onClick={() => openEdit(ws.id)} disabled={loadingEdit === ws.id}>
        {loadingEdit === ws.id ? 'กำลังโหลด…' : 'แก้ไข'}
      </button>
    );
    const progress = (
      <div className="adm-progress">
        <div style={{ fontSize: 13 }}>
          <b>{booked}</b>
          <span className="adm-meta"> / {ws.max_participants} คน</span>
        </div>
        <div className="adm-progress-bar">
          <span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--accent-dark)' : undefined }} />
        </div>
      </div>
    );
    return { where, when, st: statusOf(ws), menu, star, edit, progress };
  };

  return (
    <>
      <AdminHead
        eyebrow="admin · workshops"
        title="กิจกรรม (รอบ)"
        sub={`ทั้งหมด ${workshops.length} รายการ · ติดดาวเพื่อแสดงในการ์ดหน้าแรก`}
        actions={
          <button type="button" onClick={() => setModal({ mode: 'create' })} className="adm-btn teal">
            + เพิ่มกิจกรรม
          </button>
        }
      />

      <div className="adm-toolbar">
        <AdminSearch value={query} onChange={setQuery} placeholder="ค้นหาชื่อกิจกรรมหรือสถานที่" />
        <AdminChips value={kindFilter} onChange={setKindFilter} items={KIND_TABS} />
      </div>

      <div className="adm-card">
        {shownWorkshops.length > 0 && (
          <>
            <div className="adm-table-wrap has-cards">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>กิจกรรม</th>
                    <th>วัน · เวลา</th>
                    <th className="num">ราคา</th>
                    <th>สถานะ</th>
                    <th>ผู้สมัคร</th>
                    <th aria-label="หน้าแรก">★</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownWorkshops.map((ws) => {
                    const r = rowOf(ws);
                    return (
                      <tr key={ws.id}>
                        <td>
                          <div className="adm-cell-title">
                            <div style={{ minWidth: 0 }}>
                              <b>{ws.title}</b>
                              <small>{r.where}</small>
                            </div>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.when}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {ws.price ? `฿${ws.price.toLocaleString()}` : 'ฟรี'}
                        </td>
                        <td>
                          <Badge tone={r.st.tone}>{r.st.label}</Badge>
                        </td>
                        <td>{r.progress}</td>
                        <td>{r.star}</td>
                        <td className="act">
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {r.edit}
                            <RowMenu items={r.menu} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="adm-mcards">
              {shownWorkshops.map((ws) => {
                const r = rowOf(ws);
                return (
                  <div key={ws.id} className="adm-mcard">
                    <div className="adm-mcard-top">
                      <div>
                        <div className="adm-mcard-title">{ws.title}</div>
                        <div className="adm-mcard-sub">{r.when}</div>
                      </div>
                      {r.star}
                    </div>
                    <div className="adm-badges">
                      <Badge tone={r.st.tone}>{r.st.label}</Badge>
                      <Badge tone="mute">{ws.price ? `฿${ws.price.toLocaleString()}` : 'ฟรี'}</Badge>
                    </div>
                    <div className="adm-meta">{r.where}</div>
                    {r.progress}
                    <div className="adm-mcard-acts">
                      {r.edit}
                      <RowMenu items={r.menu} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {workshops.length > 0 && shownWorkshops.length === 0 && (
          <div className="adm-empty">
            <p style={{ margin: '0 0 12px' }}>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
            {query && (
              <button type="button" className="adm-btn sm" onClick={() => setQuery('')}>
                ล้างคำค้นหา
              </button>
            )}
          </div>
        )}
        {workshops.length === 0 && (
          <div className="adm-empty">
            ยังไม่มีกิจกรรม —{' '}
            <button type="button" onClick={() => setModal({ mode: 'create' })} className="adm-btn sm teal">
              เพิ่มกิจกรรมแรก
            </button>
          </div>
        )}
      </div>

      <AdminFormModal
        open={modal !== null}
        title={
          modal?.mode === 'application'
            ? 'ฟอร์มสมัครกิจกรรม'
            : modal?.mode === 'payout'
              ? 'จัดการการโอนเงิน (Payout)'
              : modal?.mode === 'edit'
                ? 'แก้ไขกิจกรรม'
                : 'เพิ่มกิจกรรมใหม่'
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
    </>
  );
}
