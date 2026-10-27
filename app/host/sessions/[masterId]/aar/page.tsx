'use client';

/**
 * AAR / รีวิว of a round activity (migration 077): one survey every round
 * uses, written once here; each round keeps its own QR (on the round's AAR
 * tab) and open/closed switch. Below it, every answer and review from every
 * round, filterable by round.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/design/PageLoader';
import { answerText, type SurveyAnswers, type SurveyQuestion } from '@/lib/survey';
import { SurveyEditor, starterQuestions } from '@/app/host/_components/SurveyEditor';

type MasterSurvey = { title: string | null; intro: string | null; questions: SurveyQuestion[] };
type RoundRow = { id: string; date: string; time_start: string; time_end: string; survey_open: number | null; present: number; answered: number };
type Answer = { id: string; workshop_id: string; rating: number; comment: string | null; created_at: string; user_name: string; answers: SurveyAnswers; questions: SurveyQuestion[] };
type Review = { id: string; workshop_id: string; rating: number; comment: string | null; created_at: string; user_name: string };
type Data = { master: { id: string; title: string }; survey: MasterSurvey | null; template: MasterSurvey | null; rounds: RoundRow[]; responses: Answer[]; reviews: Review[] };

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
const todayYmd = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export default function ActivityAarPage() {
  const { masterId } = useParams<{ masterId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [round, setRound] = useState<string>('all');
  const [openAnswer, setOpenAnswer] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/teacher/masters/${masterId}/survey`)
      .then(async (r) => {
        const d = (await r.json()) as Data & { error?: string };
        if (!r.ok) throw new Error(d.error || 'โหลดไม่สำเร็จ');
        return d;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        const src = d.survey || d.template;
        setTitle(src?.title || `AAR · ${d.master.title}`);
        setIntro(src?.intro || '');
        setQuestions(src ? src.questions : starterQuestions());
      })
      .catch((e: Error) => alive && setFailed(e.message));
    return () => {
      alive = false;
    };
  }, [masterId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teacher/masters/${masterId}/survey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, intro, questions }),
      });
      const d = (await res.json()) as { survey?: MasterSurvey; updated?: number; created?: number; error?: string };
      if (!res.ok || !d.survey) {
        setToast(d.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      const s = d.survey;
      setData((x) => (x ? { ...x, survey: s, template: null, rounds: x.rounds.map((r) => (r.survey_open == null && r.date >= todayYmd() ? { ...r, survey_open: 1 } : r)) } : x));
      setQuestions(s.questions);
      setDirty(false);
      const n = (d.updated || 0) + (d.created || 0);
      setToast(`บันทึกแล้ว${n ? ` · ใช้กับ ${n} รอบ` : ''} และรอบที่เปิดใหม่`);
    } catch {
      setToast('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <div className="tdb-empty"><p>{failed}</p></div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-40">
        <PageLoader />
      </div>
    );
  }

  const saved = !!data.survey;
  const roundOf = new Map(data.rounds.map((r) => [r.id, r]));
  const roundLabel = (id: string) => {
    const r = roundOf.get(id);
    return r ? `${fmtDay(r.date)} ${r.time_start}` : 'รอบที่ยกเลิก';
  };
  const answers = data.responses.filter((r) => round === 'all' || r.workshop_id === round);
  const reviews = data.reviews.filter((r) => round === 'all' || r.workshop_id === round);
  const all = [...answers.map((a) => a.rating), ...reviews.map((r) => r.rating)];
  const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: all.filter((x) => x === n).length }));
  const held = data.rounds.filter((r) => r.date <= todayYmd());

  return (
    <div>
      <Link href={`/host/sessions/${masterId}`} className="tdb-back">
        ← ปฏิทินรอบ
      </Link>
      <div className="tdb-head" style={{ margin: '18px 0 24px' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <span className="tdb-eyebrow">AAR / รีวิว · ทุกรอบ</span>
          <h1 className="tdb-h1 sm">{data.master.title}</h1>
        </div>
      </div>

      <div className="tdb-split">
        <section className="tdb-maincol">
          <div style={{ fontSize: 13, background: saved ? '#eaf6f4' : '#fcefcf', color: saved ? '#075a51' : '#8a5a00', borderRadius: 14, padding: '11px 14px', lineHeight: 1.6 }}>
            {saved
              ? 'แบบสอบถามชุดนี้ใช้กับทุกรอบ — แก้ที่นี่แล้วทุกรอบเปลี่ยนตาม (คำตอบเดิมยังอยู่) · QR ของแต่ละรอบอยู่ที่ปุ่ม “AAR / รีวิว” บนการ์ดรอบ'
              : data.template
                ? 'คัดลอกคำถามจากรอบล่าสุดมาให้แล้ว — กดบันทึกเพื่อใช้ชุดนี้กับทุกรอบ'
                : 'เริ่มจากคำถาม AAR มาตรฐาน 4 ข้อ — แก้ได้ตามต้องการ แล้วกดบันทึกเพื่อใช้กับทุกรอบ'}
          </div>

          <SurveyEditor
            title={title}
            intro={intro}
            questions={questions}
            onTitle={(v) => {
              setTitle(v);
              setDirty(true);
            }}
            onIntro={(v) => {
              setIntro(v);
              setDirty(true);
            }}
            onQuestions={(fn) => {
              setQuestions(fn);
              setDirty(true);
            }}
          />

          <div className="tdb-savebar">
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <i style={{ background: !saved || dirty ? 'var(--accent)' : '#5fd1c1' }} />
              {!saved ? 'ยังไม่ได้บันทึก' : dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว · ใช้กับทุกรอบ'}
            </span>
            <button type="button" onClick={save} disabled={saving} className="btn btn-teal" style={{ padding: '12px 22px', fontSize: 14, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกการแก้ไข' : 'บันทึกใช้ทุกรอบ'}
            </button>
          </div>
        </section>

        <aside className="tdb-aside">
          <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="tdb-mono-label">คะแนนรวม{round !== 'all' ? ' · รอบที่เลือก' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <b style={{ fontFamily: "'Mitr', sans-serif", fontSize: 36, lineHeight: 1 }}>{all.length ? avg.toFixed(1) : '—'}</b>
              <span style={{ color: '#e0a526', letterSpacing: 1 }}>{stars(Math.round(avg))}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{all.length} คน</span>
            </div>
            {dist.map(({ n, c }) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 22 }}>{n}★</span>
                <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--cream)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${all.length ? (c / all.length) * 100 : 0}%`, background: 'var(--accent)' }} />
                </span>
                <span style={{ width: 22, textAlign: 'right', color: 'var(--muted)' }}>{c}</span>
              </div>
            ))}
          </div>

          <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="tdb-mono-label" style={{ marginBottom: 6 }}>
              รอบที่จัดแล้ว · ตอบ / มา
            </span>
            {held.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>ยังไม่มีรอบที่จัดแล้ว</span>}
            {held.map((r) => (
              <Link key={r.id} href={`/host/sessions/round/${r.id}?tab=aar`} className="tdb-resp" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                  {fmtDay(r.date)} <span style={{ color: 'var(--muted)' }}>{r.time_start}</span>
                </span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  {r.answered}/{r.present}
                </span>
                <span style={{ fontSize: 11.5, color: r.survey_open ? 'var(--teal)' : 'var(--muted)', width: 64, textAlign: 'right' }}>
                  {r.survey_open == null ? 'ยังไม่มี' : r.survey_open ? 'เปิดรับ' : 'ปิดรับ'} →
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, margin: 0 }}>คำตอบและรีวิว</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {answers.length} คำตอบ · {reviews.length} รีวิวนอกแบบสอบถาม
          </span>
        </div>
        <div className="tdb-chips">
          <button type="button" className={`tdb-chip${round === 'all' ? ' on' : ''}`} onClick={() => setRound('all')}>
            ทุกรอบ <span className="n">{data.responses.length + data.reviews.length}</span>
          </button>
          {held
            .filter((r) => r.answered > 0 || data.reviews.some((v) => v.workshop_id === r.id))
            .map((r) => (
              <button key={r.id} type="button" className={`tdb-chip${round === r.id ? ' on' : ''}`} onClick={() => setRound(r.id)}>
                {fmtDay(r.date)} {r.time_start}
              </button>
            ))}
        </div>

        {answers.length + reviews.length === 0 && <div className="tdb-empty"><p>ยังไม่มีคำตอบหรือรีวิว</p></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {answers.map((a) => {
            const open = openAnswer === a.id;
            return (
              <div key={a.id} className="tdb-panel" style={{ padding: 0 }}>
                <button type="button" className="tdb-resp" style={{ width: '100%', padding: '14px 18px' }} onClick={() => setOpenAnswer(open ? null : a.id)} aria-expanded={open}>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{a.user_name}</span>
                      <span style={{ color: '#e0a526', fontSize: 13, letterSpacing: 1 }}>{stars(a.rating)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                      {roundLabel(a.workshop_id)} · {open ? 'ซ่อนคำตอบ' : 'ดูคำตอบ'}
                    </span>
                    {a.comment && <span style={{ display: 'block', fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.comment}</span>}
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {a.questions.map((q, i) => (
                      <div key={q.id} style={{ fontSize: 13.5 }}>
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5 }}>
                          {i + 1}. {q.label}
                        </span>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{answerText(q, a.answers[q.id]) || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {reviews.map((r) => (
            <div key={r.id} className="tdb-panel" style={{ padding: '14px 18px' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.user_name}</span>
                <span style={{ color: '#e0a526', fontSize: 13, letterSpacing: 1 }}>{stars(r.rating)}</span>
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{roundLabel(r.workshop_id)} · รีวิว</span>
              {r.comment && <span style={{ display: 'block', fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.comment}</span>}
            </div>
          ))}
        </div>
      </section>

      {toast && (
        <div className="toast" style={{ zIndex: 200 }}>
          <span style={{ color: 'var(--accent)' }}>✓</span> {toast}
        </div>
      )}
    </div>
  );
}
