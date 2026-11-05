'use client';

/*
 * A host postpones or cancels their single activity that people booked
 * (POST /api/teacher/submissions/single/[id]/cancel). Postponing takes effect
 * at once: every party moves to the new date unless switched to "คืนเงิน";
 * cancelling sends everyone to admin's refund list. Nothing is deleted.
 */
import { useEffect, useState } from 'react';
import type { Party } from '@/lib/booking-parties';

type Info = {
  workshop: { id: string; title: string; date: string; time_start: string; time_end: string };
  started: boolean;
  parties: Party[];
};

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();
const thDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
const todayYmd = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function PostponeModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'postpone' | 'cancel'>('postpone');
  const [date, setDate] = useState('');
  const [ts, setTs] = useState('');
  const [te, setTe] = useState('');
  const [refund, setRefund] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/teacher/submissions/single/${id}/cancel`)
      .then(async (r) => {
        const d = (await r.json()) as Info & { error?: string };
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setInfo(d);
        setTs(d.workshop.time_start);
        setTe(d.workshop.time_end);
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  const toggle = (pid: string) =>
    setRefund((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  async function go() {
    if (!info) return;
    const msg =
      mode === 'cancel'
        ? `ยกเลิก "${info.workshop.title}"? ผู้จองทั้ง ${info.parties.length} รายการจะได้รับเงินคืน (ทีมงานเป็นผู้โอนคืน)`
        : `เลื่อนเป็น ${thDay(date)} ${ts}–${te} น.? ย้าย ${info.parties.length - refund.size} รายการ · คืนเงิน ${refund.size} รายการ — มีผลทันทีและแจ้งผู้จองทาง LINE`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/teacher/submissions/single/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'cancel' ? { action: 'cancel' } : { action: 'postpone', date, time_start: ts, time_end: te, refund: [...refund] }),
      });
      const d = (await r.json()) as { error?: string; moved?: number; refunded?: number };
      if (!r.ok) return setErr(d.error || 'ทำรายการไม่สำเร็จ');
      onDone(
        mode === 'cancel'
          ? `ยกเลิกแล้ว — ผู้จองเข้าสู่รายการคืนเงินของทีมงาน (${d.refunded || 0} รายการ)`
          : `เลื่อนแล้ว — ย้าย ${d.moved || 0} รายการ · คืนเงิน ${d.refunded || 0} รายการ`,
      );
    } finally {
      setBusy(false);
    }
  }

  const canGo = !!info && !info.started && (mode === 'cancel' || (!!date && !!ts && !!te && te > ts));

  return (
    <div className="tdb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section className="tdb-modal tdb-pp" role="dialog" aria-modal="true" aria-label="เลื่อนหรือยกเลิกกิจกรรม">
        <div className="tdb-grab tdb-phone-only" aria-hidden />
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="tdb-eyebrow" style={{ fontSize: 11 }}>
              เลื่อน / ยกเลิกกิจกรรม
            </span>
            <h2 className="tdb-pp-title">{info?.workshop.title || '…'}</h2>
            {info && (
              <p className="tdb-sub-meta">
                เดิม {thDay(info.workshop.date)} {info.workshop.time_start}–{info.workshop.time_end} น. · ผู้จอง {info.parties.length} รายการ
              </p>
            )}
          </div>
          <button type="button" className="tdb-x" onClick={onClose} disabled={busy} aria-label="ปิด">
            ×
          </button>
        </div>

        {info?.started && <div className="tdb-sub-note">กิจกรรมเริ่มไปแล้ว — เลื่อนหรือยกเลิกไม่ได้ ติดต่อทีมงาน</div>}

        {info && !info.started && (
          <>
            <div className="tdb-pp-seg">
              <button type="button" className={mode === 'postpone' ? 'on' : ''} onClick={() => setMode('postpone')}>
                เลื่อนวัน
              </button>
              <button type="button" className={mode === 'cancel' ? 'on' : ''} onClick={() => setMode('cancel')}>
                ยกเลิกกิจกรรม
              </button>
            </div>

            {mode === 'postpone' ? (
              <>
                <div className="tdb-pp-when">
                  <label>
                    <span>วันใหม่</span>
                    <input type="date" value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label>
                    <span>เริ่ม</span>
                    <input type="time" value={ts} onChange={(e) => setTs(e.target.value)} />
                  </label>
                  <label>
                    <span>จบ</span>
                    <input type="time" value={te} onChange={(e) => setTe(e.target.value)} />
                  </label>
                </div>
                <p className="tdb-sub-meta">ทุกคนย้ายไปวันใหม่ — แตะ “คืนเงิน” สำหรับคนที่ไม่สะดวก (คุยกับผู้จองก่อน) ทีมงานจะเป็นผู้โอนคืน</p>
                <div className="tdb-pp-list">
                  {info.parties.map((p) => {
                    const back = refund.has(p.id);
                    return (
                      <div key={p.id} className={`tdb-pp-party${back ? ' is-refund' : ''}`}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <b>{p.name}</b>
                          <span className="tdb-sub-meta">
                            {p.kind === 'private' ? 'เหมารอบ' : p.seats > 1 ? `กลุ่ม ${p.seats} คน` : '1 ที่นั่ง'} · {baht(p.amount)}
                            {p.members.length ? ` · ${p.members.join(', ')}` : ''}
                          </span>
                        </div>
                        <button type="button" className="tdb-pp-toggle" onClick={() => toggle(p.id)}>
                          {back ? 'คืนเงิน' : 'ย้ายไปวันใหม่'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="tdb-sub-note">
                กิจกรรมจะถูกปิด (ไม่ได้ลบ) และผู้จองทั้ง {info.parties.length} รายการเข้าสู่รายการคืนเงินของทีมงาน — ผู้จองได้รับแจ้งทาง LINE
              </p>
            )}
          </>
        )}

        {err && <p className="tdb-ver-err">{err}</p>}
        <div className="tdb-sub-acts" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="tdb-sub-btn" onClick={onClose} disabled={busy}>
            ปิด
          </button>
          <button type="button" className={`tdb-sub-btn ${mode === 'cancel' ? 'danger' : 'ink'}`} disabled={!canGo || busy} onClick={go}>
            {busy ? 'กำลังทำรายการ…' : mode === 'cancel' ? 'ยกเลิกกิจกรรม' : 'ยืนยันเลื่อนวัน'}
          </button>
        </div>
      </section>
    </div>
  );
}
