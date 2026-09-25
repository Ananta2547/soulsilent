'use client';

/* What the AAR QR code opens. The visitor signs in, and if the teacher checked
 * them in as present they answer the teacher's questions, then give stars and
 * a short review — once. Anyone else is told why they cannot answer. */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { OTHER, type SurveyAnswers, type SurveyQuestion } from '@/lib/survey';

type Info = {
  workshop: { id: string; title: string; date: string; time_start: string; time_end: string; image_url: string | null };
  title: string | null;
  is_open: boolean;
  signedIn: boolean;
  eligible: boolean;
  answered: boolean;
  intro?: string | null;
  questions?: SurveyQuestion[];
  error?: string;
};

export default function SurveyPage() {
  const { workshopId } = useParams<{ workshopId: string }>();
  const { lang } = useLang();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/surveys/${workshopId}`);
        const d = (await res.json()) as Info;
        if (!alive) return;
        if (!res.ok) setError(d.error || 'ไม่พบแบบสอบถามนี้');
        else setInfo(d);
      } catch {
        if (alive) setError('โหลดข้อมูลไม่สำเร็จ');
      }
    })();
    return () => {
      alive = false;
    };
  }, [workshopId]);

  const setSel = (q: SurveyQuestion, value: string, on: boolean) =>
    setAnswers((a) => {
      const cur = a[q.id]?.selected || [];
      const selected = q.type === 'single' ? (on ? [value] : []) : on ? [...cur, value] : cur.filter((s) => s !== value);
      return { ...a, [q.id]: { ...a[q.id], selected } };
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!rating) {
      setSubmitError('กรุณาให้คะแนนดาวก่อนส่ง');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/surveys/${workshopId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, rating, comment }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) setSubmitError(d.error || 'ส่งไม่สำเร็จ');
      else setDone(true);
    } catch {
      setSubmitError('ส่งไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div className="svy-page">
      {info && (
        <div className="svy-head">
          <span className="eyebrow">{tr(lang, 'แบบสอบถามหลังกิจกรรม', 'After-action survey')}</span>
          <h1 className="display-th" style={{ fontSize: 'clamp(22px,4vw,30px)', margin: '8px 0 4px' }}>
            {info.title || info.workshop.title}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            {info.workshop.title} ·{' '}
            {new Date(info.workshop.date + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      )}
      {children}
    </div>
  );

  const note = (text: string, action?: React.ReactNode) =>
    wrap(
      <div className="card card-static" style={{ textAlign: 'center', padding: '36px 22px' }}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{text}</p>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
      </div>,
    );

  if (error) return note(error);
  if (!info) return wrap(<div style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>{tr(lang, 'กำลังโหลด…', 'Loading…')}</div>);

  if (done || info.answered) {
    return note(
      done ? 'ขอบคุณที่ตอบแบบสอบถามและรีวิวกิจกรรมนี้ 🙏' : 'คุณตอบแบบสอบถามนี้ไปแล้ว ขอบคุณมาก (ตอบได้คนละ 1 ครั้ง)',
      <Link href="/" className="btn btn-paper">
        {tr(lang, 'กลับหน้าแรก', 'Home')}
      </Link>,
    );
  }
  if (!info.signedIn) {
    return note(
      'กรุณาเข้าสู่ระบบก่อนทำแบบสอบถาม ด้วยบัญชีเดียวกับที่ใช้จองกิจกรรม',
      <Link href={`/auth/login?redirect=${encodeURIComponent(`/survey/${workshopId}`)}`} className="btn btn-teal">
        {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
      </Link>,
    );
  }
  if (!info.eligible) {
    return note('แบบสอบถามนี้ตอบได้เฉพาะผู้ที่ถูกเช็คชื่อว่ามาเข้าร่วมกิจกรรมนี้ ถ้าคุณมาแล้วแต่ยังตอบไม่ได้ แจ้งผู้สอนให้เช็คชื่อให้ก่อน แล้วสแกนใหม่อีกครั้ง');
  }
  if (!info.is_open) return note('แบบสอบถามนี้ปิดรับคำตอบแล้ว');

  const questions = info.questions || [];
  const shown = hover || rating;

  return wrap(
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {info.intro && (
        <div className="card card-static" style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {info.intro}
        </div>
      )}

      {questions.map((q, i) => {
        const a = answers[q.id] || {};
        const sel = a.selected || [];
        return (
          <fieldset key={q.id} className="card card-static svy-ans">
            <legend className="svy-ans-q">
              {i + 1}. {q.label}
              {q.required && <span style={{ color: '#b42318' }}> *</span>}
              {q.type === 'multi' && <span className="svy-ans-hint">{tr(lang, 'เลือกได้หลายข้อ', 'Pick any')}</span>}
            </legend>
            {q.type === 'text' ? (
              <textarea
                className="field"
                rows={3}
                maxLength={2000}
                value={a.text || ''}
                onChange={(e) => setAnswers((x) => ({ ...x, [q.id]: { text: e.target.value } }))}
                placeholder={tr(lang, 'พิมพ์คำตอบ', 'Your answer')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...q.options, ...(q.allowOther ? [OTHER] : [])].map((o) => {
                  const checked = sel.includes(o);
                  return (
                    <label key={o} className={`svy-opt ${checked ? 'on' : ''}`}>
                      <input type={q.type === 'single' ? 'radio' : 'checkbox'} name={q.id} checked={checked} onChange={(e) => setSel(q, o, e.target.checked)} />
                      <span style={{ flex: 1, minWidth: 0 }}>{o === OTHER ? tr(lang, 'อื่นๆ', 'Other') : o}</span>
                    </label>
                  );
                })}
                {sel.includes(OTHER) && (
                  <input
                    className="field"
                    autoFocus
                    maxLength={300}
                    placeholder={tr(lang, 'โปรดระบุ', 'Please specify')}
                    value={a.other || ''}
                    onChange={(e) => setAnswers((x) => ({ ...x, [q.id]: { ...x[q.id], other: e.target.value } }))}
                  />
                )}
              </div>
            )}
          </fieldset>
        );
      })}

      {/* Always last: stars + review. */}
      <section className="card card-static svy-ans svy-rate">
        <div className="svy-ans-q">
          {tr(lang, 'ให้คะแนนกิจกรรมนี้', 'Rate this workshop')}
          <span style={{ color: '#b42318' }}> *</span>
        </div>
        <div className="svy-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={tr(lang, 'คะแนน', 'Rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ดาว`}
              className={n <= shown ? 'on' : ''}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          className="field"
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={tr(lang, 'เขียนรีวิวสั้นๆ (ไม่บังคับ)', 'A short review (optional)')}
        />
      </section>

      {submitError && <div style={{ color: '#b42318', fontSize: 14 }}>{submitError}</div>}
      <button type="submit" className="btn btn-teal" disabled={submitting} style={{ justifyContent: 'center', padding: '14px 22px' }}>
        {submitting ? tr(lang, 'กำลังส่ง…', 'Sending…') : tr(lang, 'ส่งแบบสอบถาม', 'Submit')}
      </button>
    </form>,
  );
}
