'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { fmtDateTime } from '@/lib/datetime';

type AppAnswer = { id: string; label: string; value: string | string[] };
type AppProfile = {
  fullName?: string;
  nickname?: string;
  age?: number | null;
  gender?: string;
  email?: string;
  phone?: string;
  facebook?: string;
  lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string;
  dietary?: string;
};
type ApplicationSnapshot = { profile?: AppProfile; answers?: AppAnswer[] };

type Row = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  status: string;
  payment_status: string;
  amount: number;
  app_status: string;
  waitlist_rank: number | null;
  confirmed_at: string | null;
  application_json: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  applied: { label: 'รอพิจารณา', cls: 'bg-gray-lighter text-gray' },
  approved: { label: 'ผ่านการคัดเลือก', cls: 'bg-primary/15 text-primary' },
  waitlisted: { label: 'ตัวสำรอง', cls: 'bg-amber-100 text-amber-700' },
  rejected: { label: 'ไม่ผ่าน', cls: 'bg-red-100 text-red-600' },
};

export default function ApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [wsRes, bRes] = await Promise.all([
        fetch(`/api/workshops/${id}`),
        fetch(`/api/bookings?workshop_id=${id}`),
      ]);
      if (!wsRes.ok || !bRes.ok) throw new Error(`HTTP ${wsRes.status}/${bRes.status}`);
      const wsData = (await wsRes.json()) as { workshop: Workshop };
      const bData = (await bRes.json()) as { bookings: Row[] };
      setWorkshop(wsData.workshop);
      setRows(bData.bookings || []);
    } catch (e) {
      console.error('Failed to load applicants', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function setStatus(row: Row, app_status: string, waitlist_rank?: number | null) {
    setBusyId(row.id);
    try {
      await fetch(`/api/bookings/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_status, waitlist_rank: waitlist_rank ?? null }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-gray">กำลังโหลด…</div>;
  }

  if (loadError) {
    return (
      <div className="p-8 text-gray flex flex-col items-start gap-3">
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); load(); }} className="border border-primary text-primary rounded-full px-6 py-2 text-sm font-semibold">ลองใหม่</button>
      </div>
    );
  }

  const fmt = (d: string | null) => fmtDateTime(d, 'th');

  const counts = {
    applied: rows.filter((r) => r.app_status === 'applied').length,
    approved: rows.filter((r) => r.app_status === 'approved').length,
    waitlisted: rows.filter((r) => r.app_status === 'waitlisted').length,
    rejected: rows.filter((r) => r.app_status === 'rejected').length,
  };
  // Suggest the next waitlist rank.
  const nextRank =
    Math.max(0, ...rows.filter((r) => r.app_status === 'waitlisted' && r.waitlist_rank != null).map((r) => r.waitlist_rank as number)) + 1;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/admin/workshops" className="text-sm text-gray hover:text-primary hover:underline">
        ← กลับไปจัดการ Workshop
      </Link>
      <h1 className="text-2xl font-bold text-dark mt-2 mb-1">ผู้สมัคร — {workshop?.title}</h1>
      <p className="text-sm text-gray mb-4">
        ที่นั่ง {workshop?.max_participants} · ประกาศผล {fmt(workshop?.announce_at ?? null)} · ยืนยันตัวจริงภายใน{' '}
        {fmt(workshop?.confirm_main_by ?? null)} · ยืนยันตัวสำรองภายใน {fmt(workshop?.confirm_waitlist_by ?? null)}
      </p>

      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        <span className="badge bg-gray-lighter text-gray">รอพิจารณา {counts.applied}</span>
        <span className="badge bg-primary/15 text-primary">ผ่าน {counts.approved}</span>
        <span className="badge bg-amber-100 text-amber-700">สำรอง {counts.waitlisted}</span>
        <span className="badge bg-red-100 text-red-600">ไม่ผ่าน {counts.rejected}</span>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && <p className="text-gray text-sm">ยังไม่มีผู้สมัคร</p>}
        {rows.map((r) => {
          const snap = parseSnap(r.application_json);
          const meta = STATUS_META[r.app_status] || STATUS_META.applied;
          const paid = r.payment_status === 'paid' || r.status === 'confirmed';
          const open = openId === r.id;
          return (
            <div key={r.id} className="border border-gray-lighter rounded-xl bg-white">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium text-dark">
                    {snap?.profile?.fullName || r.user_name || '—'}
                  </div>
                  <div className="text-xs text-gray">{r.user_email}</div>
                </div>
                <span className={`badge ${meta.cls}`}>
                  {meta.label}
                  {r.app_status === 'waitlisted' && r.waitlist_rank != null ? ` #${r.waitlist_rank}` : ''}
                </span>
                {paid && <span className="badge bg-primary text-white">ชำระแล้ว</span>}
                {r.confirmed_at && !paid && <span className="badge bg-primary/15 text-primary">ยืนยันแล้ว</span>}
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="text-xs text-gray hover:text-primary hover:underline"
                >
                  {open ? 'ซ่อนใบสมัคร' : 'ดูใบสมัคร'}
                </button>
              </div>

              {open && snap && (
                <div className="px-4 pb-4 border-t border-gray-lighter pt-3 text-sm text-dark space-y-2">
                  <Profile p={snap.profile} />
                  {(snap.answers || []).map((a) => (
                    <div key={a.id}>
                      <span className="text-gray">{a.label}: </span>
                      {Array.isArray(a.value) ? a.value.join(', ') : a.value || '—'}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r, 'approved')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-50"
                >
                  อนุมัติ (ตัวจริง)
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r, 'waitlisted', r.waitlist_rank ?? nextRank)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  ตัวสำรอง
                </button>
                {r.app_status === 'waitlisted' && (
                  <input
                    type="number"
                    min="1"
                    defaultValue={r.waitlist_rank ?? nextRank}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== r.waitlist_rank) setStatus(r, 'waitlisted', v);
                    }}
                    className="w-16 text-xs border border-gray-lighter rounded-lg px-2 py-1"
                    title="อันดับสำรอง"
                  />
                )}
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r, 'rejected')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  ไม่ผ่าน
                </button>
                {r.app_status !== 'applied' && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r, 'applied')}
                    className="text-xs text-gray hover:text-primary hover:underline ml-1"
                  >
                    รีเซ็ตเป็นรอพิจารณา
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseSnap(json: string | null): ApplicationSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ApplicationSnapshot;
  } catch {
    return null;
  }
}

function Profile({ p }: { p?: AppProfile }) {
  if (!p) return null;
  const items: [string, string][] = [
    ['ชื่อเล่น', p.nickname || '—'],
    ['อายุ', p.age != null ? `${p.age} ปี` : '—'],
    ['เพศ', p.gender || '—'],
    ['โทร', p.phone || '—'],
    ['อีเมล', p.email || '—'],
    ['Facebook', p.facebook || '—'],
    ['Line', p.lineId || '—'],
    ['ฉุกเฉิน', p.emergency ? `${p.emergency.name || '—'} (${p.emergency.relation || '—'}) ${p.emergency.phone || ''}` : '—'],
    ['สุขภาพ/แพ้', p.medical || '—'],
    ['อาหาร', p.dietary || '—'],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs bg-surface/40 rounded-lg p-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <span className="text-gray">{k}: </span>
          {v}
        </div>
      ))}
    </div>
  );
}
