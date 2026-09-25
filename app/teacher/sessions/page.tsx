'use client';

/* จัดรอบสอน, first screen — design "Teacher Sessions v2": one poster card per
 * activity the admin handed this teacher that runs in rounds, with its next
 * round (or latest past one), seats taken and how many rounds / days it has.
 * Tapping a card opens that activity's calendar. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Workshop, WorkshopMaster } from '@/lib/types';
import { PAY_PILL, Pill, SeatBar, fmtShort, todayYmd } from '@/components/teacher/tdb';

type Round = { id: string; master_id: string; date: string; time_start: string; time_end: string; loc_name: string | null; max_participants: number; status: string; booked: number };
type Data = { masters: WorkshopMaster[]; rounds: Round[]; payout: Record<string, string | null> };
type Kind = 'none' | 'ended' | 'open';

const PILLS: Record<Kind, [string, string, string, string]> = {
  none: ['ยังไม่มีรอบ', '#6a7a78', '#f6f1e6', '#a5d9d1'],
  ended: ['จบแล้ว', '#6a7a78', '#f6f1e6', '#6a7a78'],
  open: ['เปิดรับ', '#075a51', '#eaf6f4', '#0d8a7e'],
};

export default function TeacherSessionsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'ended'>('all');

  useEffect(() => {
    let alive = true;
    // Masters and rounds come from the session manager; whether each round's
    // payout went out comes from the workshop list.
    Promise.all([
      fetch('/api/teacher/sessions').then((r) => (r.ok ? (r.json() as Promise<{ masters: WorkshopMaster[]; rounds: Round[] }>) : { masters: [], rounds: [] })),
      fetch('/api/teacher/workshops').then((r) => (r.ok ? (r.json() as Promise<{ workshops: Workshop[] }>) : { workshops: [] })),
    ])
      .then(([s, w]) => ({
        masters: s.masters || [],
        rounds: (s.rounds || []).filter((r) => r.status !== 'cancelled'),
        payout: Object.fromEntries((w.workshops || []).map((x) => [x.id, x.payout_status ?? null])),
      }))
      .catch(() => ({ masters: [], rounds: [], payout: {} }))
      .then((d) => {
        if (alive) setData(d);
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = todayYmd();
  const cards = (data?.masters || []).map((m) => {
    const group = (data?.rounds || []).filter((r) => r.master_id === m.id).sort((a, b) => a.date.localeCompare(b.date) || a.time_start.localeCompare(b.time_start));
    const rep = group.find((r) => r.date >= today) || group[group.length - 1] || null;
    const ended = !!rep && rep.date < today;
    const kind: Kind = !rep ? 'none' : ended ? 'ended' : 'open';
    return { m, group, rep, ended, kind, days: new Set(group.map((r) => r.date)).size };
  });
  const counts = { all: cards.length, open: cards.filter((c) => c.kind === 'open').length, ended: cards.filter((c) => c.kind !== 'open').length };
  const shown = cards.filter((c) => filter === 'all' || (filter === 'open' ? c.kind === 'open' : c.kind !== 'open'));

  return (
    <div>
      <div className="tdb-head">
        <div style={{ maxWidth: 620 }}>
          <span className="tdb-eyebrow">01 — จัดรอบสอน</span>
          <h1 className="tdb-h1">เปิดรอบสอน.</h1>
          <p className="tdb-lead">เลือก Workshop ที่ต้องการ แล้วจัดวัน เวลา และสถานที่ของแต่ละรอบ — ผู้เรียนจะเห็นรอบใหม่ทันทีที่เปิด</p>
        </div>
        <div className="tdb-seg tdb-hide-phone">
          {(
            [
              ['all', 'ทั้งหมด'],
              ['open', 'เปิดรับ'],
              ['ended', 'ยังไม่เปิด / จบแล้ว'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)} style={{ fontSize: 13, fontWeight: 500, padding: '8px 16px' }}>
              {label} <span className="n">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tdb-chips tdb-phone-only">
        {(
          [
            ['all', 'ทั้งหมด'],
            ['open', 'เปิดรับ'],
            ['ended', 'ยังไม่เปิด / จบแล้ว'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={`tdb-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {label} <span className="n">{counts[k]}</span>
          </button>
        ))}
      </div>

      {data === null ? null : cards.length === 0 ? (
        <div className="tdb-empty" style={{ padding: '64px 24px', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: '#eaf6f4', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3.5" y="5" width="17" height="15" rx="2" strokeWidth="1.8" />
              <path strokeLinecap="round" strokeWidth="1.8" d="M8 3v4M16 3v4M3.5 10h17" />
            </svg>
          </div>
          <h3 style={{ fontSize: 22, marginTop: 4 }}>ยังไม่มี Workshop ให้จัดรอบ</h3>
          <p>เมื่อ Admin ผูก Workshop แบบเลือกรอบไว้กับชื่อคุณ จะแสดงที่นี่</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="tdb-dashed">ไม่มี Workshop ในหมวดนี้</div>
      ) : (
        <div className="tdb-grid">
          {shown.map(({ m, group, rep, ended, kind, days }) => {
            const image = m.cover_image_url;
            return (
              <Link key={m.id} href={`/teacher/sessions/${m.id}`} className="tdb-card">
                <div className="tdb-poster" style={{ width: 124 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {image && <img src={image} alt="" />}
                </div>
                <div className="tdb-card-body">
                  <div className="tdb-card-tags">
                    <Pill s={PILLS[kind]} />
                    {rep && PAY_PILL(data.payout[rep.id] === 'paid')}
                  </div>
                  <h3 className="tdb-card-title">{m.title}</h3>
                  {rep ? (
                    <div className="tdb-card-box">
                      <span className="tdb-mono-label" style={{ fontSize: 10 }}>{ended ? 'รอบล่าสุด' : 'รอบถัดไป'}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {fmtShort(rep.date)} · {rep.time_start}–{rep.time_end}
                        {rep.loc_name ? ` · ${rep.loc_name}` : ''}
                      </span>
                      <SeatBar booked={rep.booked} max={rep.max_participants} full={false} />
                    </div>
                  ) : (
                    <div className="tdb-card-dash">ยังไม่มีรอบ — เริ่มเปิดรอบแรกได้เลย</div>
                  )}
                  <div className="tdb-card-foot">
                    <span>{rep ? `${group.length} รอบ · ${days} วัน` : 'ยังไม่ได้เปิด'}</span>
                    <span className="tdb-card-cta">จัดรอบ →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
