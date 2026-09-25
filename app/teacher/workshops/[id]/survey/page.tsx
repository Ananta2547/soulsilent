'use client';

/* AAR survey builder for one workshop (or one round). The teacher writes the
 * questions, saves, and shows the QR code at the end of the session;
 * participants who were checked in scan it, sign in and answer once. The star
 * rating is always the last part of the form and is not edited here. */

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { PageLoader } from '@/components/design/PageLoader';
import { useLang, T, tr } from '@/lib/i18n';
import { QUESTION_TYPES, newQuestionId, type Survey, type SurveyQuestion, type SurveyQuestionType, type SurveyResponse } from '@/lib/survey';

type Data = {
  workshop: { id: string; title: string; date: string; time_start: string; time_end: string };
  survey: Survey | null;
  template: Survey | null;
  responses: SurveyResponse[];
};

/** The four classic after-action review questions — a starting point the
 *  teacher can reword or delete. */
const starter = (): SurveyQuestion[] => [
  { id: newQuestionId(), type: 'text', label: 'ก่อนเริ่มกิจกรรม คุณคาดหวังอะไรไว้บ้าง', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'สิ่งที่เกิดขึ้นจริงเป็นอย่างไร', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'ทำไมจึงต่างหรือเหมือนกับที่คาดไว้', options: [], allowOther: false, required: false },
  { id: newQuestionId(), type: 'text', label: 'ครั้งหน้าอยากให้ปรับหรือเพิ่มอะไร', options: [], allowOther: false, required: false },
];

const blank = (type: SurveyQuestionType): SurveyQuestion => ({
  id: newQuestionId(),
  type,
  label: '',
  options: type === 'text' ? [] : ['', ''],
  allowOther: false,
  required: true,
});

export default function TeacherSurveyPage() {
  const { id } = useParams<{ id: string }>();
  // Back to whichever roster this was opened from (round or one-day).
  const rosterHref = usePathname().startsWith('/teacher/sessions/') ? `/teacher/sessions/round/${id}` : `/teacher/workshops/${id}`;
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [copiedFrom, setCopiedFrom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrBig, setQrBig] = useState(false);
  const [copied, setCopied] = useState(false);

  const surveyUrl = typeof window !== 'undefined' ? `${window.location.origin}/survey/${id}` : '';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/teacher/workshops/${id}/survey`);
        const d = (await res.json()) as Data & { error?: string };
        if (!alive) return;
        if (!res.ok) {
          setLoadError(d.error || 'โหลดไม่สำเร็จ');
          return;
        }
        setData(d);
        const src = d.survey || d.template;
        setTitle(src?.title || `AAR · ${d.workshop.title}`);
        setIntro(src?.intro || '');
        setQuestions(src ? src.questions : starter());
        setIsOpen(d.survey ? d.survey.is_open : true);
        setCopiedFrom(!d.survey && !!d.template);
      } catch {
        if (alive) setLoadError('โหลดไม่สำเร็จ');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // The QR code only exists once there is a saved survey behind it.
  const saved = !!data?.survey;
  useEffect(() => {
    if (!saved || !surveyUrl) return;
    QRCode.toDataURL(surveyUrl, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [saved, surveyUrl]);

  useEffect(() => {
    if (!qrBig) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrBig(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [qrBig]);

  if (loadError) return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 48 }}>{loadError}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-40">
        <PageLoader />
      </div>
    );
  }

  const patch = (i: number, p: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const n = [...qs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function save(nextOpen = isOpen) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/teacher/workshops/${id}/survey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, intro, questions, is_open: nextOpen }),
      });
      const d = (await res.json()) as { survey?: Survey; error?: string };
      if (!res.ok || !d.survey) {
        setMsg({ ok: false, text: d.error || tr(lang, 'บันทึกไม่สำเร็จ', 'Save failed') });
        return;
      }
      const s = d.survey;
      setData((prev) => (prev ? { ...prev, survey: s } : prev));
      setQuestions(s.questions);
      setIsOpen(s.is_open);
      setCopiedFrom(false);
      setMsg({ ok: true, text: tr(lang, 'บันทึกแล้ว', 'Saved') });
    } catch {
      setMsg({ ok: false, text: tr(lang, 'บันทึกไม่สำเร็จ', 'Save failed') });
    } finally {
      setSaving(false);
    }
  }

  const responses = data.responses;
  const avg = responses.length ? responses.reduce((s, r) => s + r.rating, 0) / responses.length : 0;
  const w = data.workshop;

  return (
    <div style={{ maxWidth: 860 }}>
      <Link href={rosterHref} className="mono" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {tr(lang, 'กลับไปหน้าผู้เข้าร่วม', 'Back to participants')}
      </Link>
      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>
        <T th="แบบสอบถาม AAR" en="AAR survey" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(22px,3vw,30px)', margin: '8px 0 4px' }}>
        {w.title}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        {new Date(w.date + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {w.time_start}–{w.time_end}
      </p>

      {/* QR + state */}
      <section className="card card-static svy-qr" style={{ marginBottom: 22 }}>
        {saved && qr ? (
          <button type="button" onClick={() => setQrBig(true)} className="svy-qr-img" aria-label={tr(lang, 'ขยาย QR', 'Enlarge QR')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" />
          </button>
        ) : (
          <div className="svy-qr-img svy-qr-empty">{tr(lang, 'บันทึกแบบสอบถามก่อน แล้ว QR จะขึ้นที่นี่', 'Save the survey first — the QR code appears here')}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                padding: '4px 12px',
                color: !saved ? 'var(--muted)' : isOpen ? 'var(--teal-deep)' : '#9a4a3f',
                background: !saved ? 'var(--cream)' : isOpen ? 'var(--teal-50)' : '#f6e7e4',
              }}
            >
              {!saved ? tr(lang, 'ยังไม่ได้บันทึก', 'Not saved yet') : isOpen ? tr(lang, 'เปิดรับคำตอบ', 'Accepting answers') : tr(lang, 'ปิดรับคำตอบ', 'Closed')}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {tr(lang, `ตอบแล้ว ${responses.length} คน`, `${responses.length} answered`)}
              {responses.length > 0 && ` · ★ ${avg.toFixed(1)}`}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.6 }}>
            {tr(
              lang,
              'ให้ผู้เข้าร่วมสแกน QR หลังจบกิจกรรม ต้องเข้าสู่ระบบก่อน และตอบได้เฉพาะคนที่ถูกเช็คชื่อว่า “มา” — คนละ 1 ครั้ง',
              'Participants scan after the session. They must sign in, and only those checked in as present can answer — once each.',
            )}
          </p>
          {saved && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ink btn-sm" onClick={() => setQrBig(true)}>
                {tr(lang, 'แสดง QR เต็มจอ', 'Show QR full screen')}
              </button>
              {qr && (
                <a className="btn btn-paper btn-sm" href={qr} download={`aar-qr-${id}.png`}>
                  {tr(lang, 'ดาวน์โหลด QR', 'Download QR')}
                </a>
              )}
              <button
                type="button"
                className="btn btn-paper btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(surveyUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? tr(lang, 'คัดลอกแล้ว', 'Copied') : tr(lang, 'คัดลอกลิงก์', 'Copy link')}
              </button>
              <button type="button" className="btn btn-paper btn-sm" disabled={saving} onClick={() => save(!isOpen)}>
                {isOpen ? tr(lang, 'ปิดรับคำตอบ', 'Stop answers') : tr(lang, 'เปิดรับคำตอบอีกครั้ง', 'Reopen')}
              </button>
            </div>
          )}
        </div>
      </section>

      {copiedFrom && (
        <div style={{ fontSize: 13, background: '#fcefcf', color: '#8a5a00', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
          {tr(lang, 'คัดลอกคำถามจากรอบอื่นของกิจกรรมนี้มาให้แล้ว — แก้ได้ตามต้องการ แล้วกดบันทึก', 'Questions copied from another round of this activity — edit and save.')}
        </div>
      )}

      {/* Heading of the form */}
      <section className="card card-static" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="svy-lbl">
          {tr(lang, 'ชื่อแบบสอบถาม', 'Survey title')}
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="svy-lbl">
          {tr(lang, 'คำอธิบาย (ไม่บังคับ)', 'Description (optional)')}
          <textarea className="field" rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={2000} />
        </label>
      </section>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {questions.map((q, i) => (
          <section key={q.id} className="card card-static svy-q">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="svy-num">{i + 1}</span>
              <select
                className="field"
                style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as SurveyQuestionType;
                  patch(i, { type, options: type === 'text' ? [] : q.options.length ? q.options : ['', ''], allowOther: type === 'text' ? false : q.allowOther });
                }}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {tr(lang, t.th, t.en)}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <input type="checkbox" checked={q.required} onChange={(e) => patch(i, { required: e.target.checked })} />
                {tr(lang, 'บังคับตอบ', 'Required')}
              </label>
              <button type="button" className="svy-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr(lang, 'เลื่อนขึ้น', 'Move up')}>
                ↑
              </button>
              <button type="button" className="svy-icon" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label={tr(lang, 'เลื่อนลง', 'Move down')}>
                ↓
              </button>
              <button type="button" className="svy-icon svy-del" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label={tr(lang, 'ลบคำถาม', 'Delete question')}>
                ×
              </button>
            </div>
            <input className="field" placeholder={tr(lang, 'พิมพ์คำถาม', 'Question')} value={q.label} onChange={(e) => patch(i, { label: e.target.value })} maxLength={300} />

            {q.type !== 'text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {q.options.map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden className={q.type === 'single' ? 'svy-dot' : 'svy-box'} />
                    <input
                      className="field"
                      style={{ padding: '7px 10px', fontSize: 13.5 }}
                      placeholder={tr(lang, `ตัวเลือกที่ ${oi + 1}`, `Option ${oi + 1}`)}
                      value={o}
                      maxLength={200}
                      onChange={(e) => patch(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                    />
                    <button type="button" className="svy-icon" onClick={() => patch(i, { options: q.options.filter((_, k) => k !== oi) })} aria-label={tr(lang, 'ลบตัวเลือก', 'Remove option')}>
                      ×
                    </button>
                  </div>
                ))}
                {q.allowOther && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--muted)' }}>
                    <span aria-hidden className={q.type === 'single' ? 'svy-dot' : 'svy-box'} />
                    {tr(lang, 'อื่นๆ (ผู้ตอบพิมพ์เอง)', 'Other (typed by the participant)')}
                    <button type="button" className="svy-icon" onClick={() => patch(i, { allowOther: false })} aria-label={tr(lang, 'เอา อื่นๆ ออก', 'Remove other')}>
                      ×
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
                  <button type="button" className="svy-link" onClick={() => patch(i, { options: [...q.options, ''] })}>
                    + {tr(lang, 'เพิ่มตัวเลือก', 'Add option')}
                  </button>
                  {!q.allowOther && (
                    <button type="button" className="svy-link" onClick={() => patch(i, { allowOther: true })}>
                      + {tr(lang, 'เพิ่ม “อื่นๆ”', 'Add “Other”')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        ))}

        <div className="svy-add">
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr(lang, 'เพิ่มคำถาม:', 'Add a question:')}</span>
          {QUESTION_TYPES.map((t) => (
            <button key={t.type} type="button" className="btn btn-paper btn-sm" onClick={() => setQuestions((qs) => [...qs, blank(t.type)])}>
              + {tr(lang, t.th, t.en)}
            </button>
          ))}
        </div>

        {/* Always last, not editable. */}
        <section className="card card-static" style={{ background: 'var(--cream)', border: '1.5px dashed var(--cream-deep)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tr(lang, 'ส่วนท้าย: รีวิว / ให้ดาว', 'Last part: review / stars')}</div>
          <div style={{ fontSize: 22, color: '#e0a526', letterSpacing: 2 }} aria-hidden>
            ★★★★★
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
            {tr(lang, 'ผู้ตอบให้ดาว 1–5 (บังคับ) และเขียนรีวิวสั้นๆ ได้ — ขึ้นท้ายแบบสอบถามเสมอ และนับเป็นรีวิวของกิจกรรมนี้', 'Participants give 1–5 stars (required) and may add a comment — always last, and it counts as their review of this workshop.')}
          </div>
        </section>
      </div>

      <div className="svy-savebar">
        {msg && <span style={{ fontSize: 13, color: msg.ok ? 'var(--teal-deep)' : '#b42318' }}>{msg.text}</span>}
        <button type="button" className="btn btn-teal" disabled={saving} onClick={() => save()} style={{ marginLeft: 'auto' }}>
          {saving ? tr(lang, 'กำลังบันทึก…', 'Saving…') : saved ? tr(lang, 'บันทึกการแก้ไข', 'Save changes') : tr(lang, 'บันทึกและสร้าง QR', 'Save and make QR')}
        </button>
      </div>

      {qrBig && qr && (
        <div className="tc-slip-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && setQrBig(false)}>
          <div className="svy-qr-full">
            <button type="button" onClick={() => setQrBig(false)} aria-label={tr(lang, 'ปิด', 'Close')} className="svy-qr-close">
              ×
            </button>
            <div className="display-th" style={{ fontSize: 22, textAlign: 'center' }}>
              {title || w.title}
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>{tr(lang, 'สแกนเพื่อทำแบบสอบถามและรีวิว', 'Scan to answer and review')}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" />
            <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', wordBreak: 'break-all' }}>
              {surveyUrl}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
