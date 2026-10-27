'use client';

/* The host sets when booking for each round of the activity closes: so many
 * days before the round, at a set time. Applies to every round that has not
 * happened yet and every round opened later (migration 077). */

import { useState } from 'react';
import type { WorkshopMaster } from '@/lib/types';
import { closeRuleText, roundCloseAt } from '@/lib/round-rules';

const PRESETS = [
  { label: 'ไม่ปิดก่อน', days: '' },
  { label: 'วันกิจกรรม', days: '0' },
  { label: '1 วันก่อน', days: '1' },
  { label: '2 วันก่อน', days: '2' },
  { label: '3 วันก่อน', days: '3' },
  { label: '7 วันก่อน', days: '7' },
];

/** "YYYY-MM-DDTHH:MM" → "ศ. 30 ต.ค. 18:00 น." */
function fmtClose(at: string): string {
  const d = new Date(`${at.slice(0, 10)}T00:00:00`);
  return `${d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })} ${at.slice(11, 16)} น.`;
}

export function CloseRuleModal({
  master,
  nextRound,
  onClose,
  onSaved,
}: {
  master: WorkshopMaster;
  /** The nearest upcoming round, to show what the rule means in practice. */
  nextRound: { date: string; time_start: string } | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [days, setDays] = useState(master.close_days_before != null ? String(master.close_days_before) : '');
  const [time, setTime] = useState(master.close_time || '18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const example = nextRound && days !== '' ? roundCloseAt(nextRound.date, { close_days_before: Number(days), close_time: time }) : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/masters/${master.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ close_days_before: days, close_time: time }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(d.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSaved(`บันทึกแล้ว · ${closeRuleText(days, time)}`);
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tdb-backdrop center" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <section className="tdb-modal" role="dialog" aria-modal="true" aria-label="ตั้งเวลาปิดรับจอง" style={{ maxWidth: 460, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <span className="tdb-eyebrow" style={{ fontSize: 11 }}>
            ปิดรับจอง
          </span>
          <h3 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, margin: '6px 0' }}>ปิดรับจองก่อนวันกิจกรรม</h3>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>ใช้กับทุกรอบของกิจกรรมนี้ที่ยังไม่ถึง และรอบที่เปิดใหม่ — เผื่อเวลาเตรียมของหรือยืนยันรายชื่อ</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className={`tdb-chip${days === p.days ? ' on' : ''}`} style={days === p.days ? undefined : { background: 'var(--cream)' }} onClick={() => setDays(p.days)} aria-pressed={days === p.days}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="tdb-mono-label">ก่อนกี่วัน</span>
            <input type="number" min={0} max={365} step={1} className="field" value={days} placeholder="ไม่ปิดก่อน" onChange={(e) => setDays(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="tdb-mono-label">เวลา</span>
            <input type="time" className="field" value={time} disabled={days === ''} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        <div style={{ background: 'var(--cream)', borderRadius: 16, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.6 }}>
          <b>{closeRuleText(days, time)}</b>
          {example && nextRound && (
            <span style={{ display: 'block', color: 'var(--muted)' }}>
              เช่น รอบ {fmtClose(`${nextRound.date}T${nextRound.time_start}`)} ปิดรับ {fmtClose(example)}
            </span>
          )}
        </div>

        {error && <div className="tdb-note-warn">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="tdb-soft-btn" style={{ padding: '12px 20px', fontSize: 14 }} onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-teal" style={{ padding: '12px 20px', fontSize: 14 }} onClick={save} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </section>
    </div>
  );
}
