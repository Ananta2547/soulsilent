'use client';

/**
 * Link this member's LINE account (migration 079). While linked and a friend
 * of the AllSoulLearn Official Account, every notification goes to LINE
 * instead of the app. Linking runs through LINE Login (/api/line/connect),
 * which also asks to add the Official Account as a friend.
 */
import { useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';

type Status = { available: boolean; linked: boolean; blocked: boolean; linkedAt: string | null };

const LINE_GREEN = '#06C755';

/** What the callback came back with (?line=…), in words. */
const RESULT: Record<string, [string, string, boolean]> = {
  linked: ['เชื่อม LINE แล้ว — ลองกด “ส่งข้อความทดสอบ” ได้เลย', 'LINE linked — try “Send a test message”', true],
  notfriend: ['เชื่อมแล้ว แต่ยังไม่ได้เพิ่มเพื่อน AllSoulLearn — กด “เพิ่มเพื่อน” อีกครั้ง', 'Linked, but AllSoulLearn is not your friend yet — tap “Add friend”', false],
  cancelled: ['ยกเลิกการเชื่อม LINE', 'Linking was cancelled', false],
  failed: ['เชื่อม LINE ไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not link LINE, try again', false],
  unavailable: ['การแจ้งเตือนทาง LINE ยังไม่เปิดให้ใช้', 'LINE notifications are not available yet', false],
};

function LineMark() {
  return (
    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: LINE_GREEN, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, letterSpacing: '.02em', flexShrink: 0 }}>
      LINE
    </span>
  );
}

export function LineConnect() {
  const { lang } = useLang();
  const [s, setS] = useState<Status | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/line/link')
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .catch(() => null)
      .then((d) => {
        if (!alive) return;
        setS(d);
        const r = new URLSearchParams(window.location.search).get('line');
        if (r && RESULT[r]) setNote({ text: tr(lang, RESULT[r][0], RESULT[r][1]), ok: RESULT[r][2] });
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  if (!s) return null;
  if (!s.available && !s.linked) {
    return <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{tr(lang, 'การแจ้งเตือนทาง LINE ยังไม่เปิดให้ใช้ เร็ว ๆ นี้', 'LINE notifications are coming soon')}</p>;
  }

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/line/link', { method: 'POST' });
      const d = (await r.json()) as { error?: string };
      setNote(r.ok ? { text: tr(lang, 'ส่งแล้ว — เปิด LINE ดูได้เลย', 'Sent — check LINE'), ok: true } : { text: d.error || tr(lang, 'ส่งไม่สำเร็จ', 'Could not send'), ok: false });
    } finally {
      setBusy(false);
    }
  }
  async function unlink() {
    setBusy(true);
    setNote(null);
    try {
      await fetch('/api/line/link', { method: 'DELETE' });
      setS((x) => (x ? { ...x, linked: false, blocked: false, linkedAt: null } : x));
      setNote({ text: tr(lang, 'ยกเลิกการเชื่อมแล้ว — การแจ้งเตือนกลับไปส่งในแอป', 'Unlinked — notifications go back to the app'), ok: true });
    } finally {
      setBusy(false);
    }
  }

  const connectBtn = (label: string) => (
    <a href="/api/line/connect" className="pwa-cta" style={{ background: LINE_GREEN, boxShadow: '0 10px 22px -12px rgba(6,199,85,.8)', textDecoration: 'none' }}>
      {label}
    </a>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="pwa-push-head">
        <LineMark />
        <div>
          <h2>{tr(lang, 'แจ้งเตือนทาง LINE', 'LINE notifications')}</h2>
          <p>
            {!s.linked
              ? tr(lang, 'รับทุกการแจ้งเตือนเป็นแชทจาก AllSoulLearn ใน LINE แทนแจ้งเตือนในแอป — ไม่ต้องติดตั้งแอป', 'Get every notification as a chat from AllSoulLearn on LINE instead of the app — no app needed')
              : s.blocked
                ? tr(lang, 'เชื่อมแล้ว แต่ยังไม่ได้เพิ่มเพื่อน (หรือบล็อก) AllSoulLearn — ตอนนี้จึงยังส่งแจ้งเตือนในแอปแทน', 'Linked, but AllSoulLearn is not your friend (or is blocked) — notifications still go to the app')
                : tr(lang, 'เชื่อมแล้ว — การแจ้งเตือนทั้งหมดส่งทาง LINE แทนแอป ประเภทที่ปิดไว้ด้านล่างจะไม่ส่งทั้งสองทาง', 'Linked — every notification goes to LINE instead of the app. Kinds you switch off below are off on both.')}
          </p>
        </div>
      </div>

      {note && (
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: note.ok ? 'var(--teal-deep)' : '#a04a14' }} role="status">
          {note.text}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!s.linked && connectBtn(tr(lang, 'เชื่อม LINE', 'Link LINE'))}
        {s.linked && s.blocked && connectBtn(tr(lang, 'เพิ่มเพื่อน AllSoulLearn', 'Add AllSoulLearn as a friend'))}
        {s.linked && !s.blocked && (
          <button type="button" className="pwa-cta" disabled={busy} onClick={test} style={{ background: LINE_GREEN, boxShadow: '0 10px 22px -12px rgba(6,199,85,.8)' }}>
            {tr(lang, 'ส่งข้อความทดสอบ', 'Send a test message')}
          </button>
        )}
        {s.linked && (
          <button type="button" className="pwa-ghost" disabled={busy} onClick={unlink}>
            {tr(lang, 'ยกเลิกการเชื่อม', 'Unlink')}
          </button>
        )}
      </div>
    </div>
  );
}

export default LineConnect;
