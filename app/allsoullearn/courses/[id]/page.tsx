'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Course, Lesson } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { Cloud, WaveLine, Star } from '@/components/design/Doodles';

const LEVEL_LABEL: Record<string, { th: string; en: string }> = {
  beginner: { th: 'เริ่มต้น', en: 'Beginner' },
  intermediate: { th: 'กลาง', en: 'Intermediate' },
  advanced: { th: 'ขั้นสูง', en: 'Advanced' },
};

export default function CourseDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CourseDetailInner />
    </Suspense>
  );
}

function LoadingBlock() {
  return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid var(--teal)',
          borderTopColor: 'transparent',
          margin: '0 auto',
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  );
}

function CourseDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [courseRes, lessonsRes] = await Promise.all([
        fetch(`/api/courses/${id}`),
        fetch(`/api/courses/${id}/lessons`),
      ]);
      const courseData = (await courseRes.json()) as { course: Course; enrolled: boolean };
      const lessonsData = (await lessonsRes.json()) as { lessons: Lesson[] };
      setCourse(courseData.course);
      setLessons(lessonsData.lessons || []);
      setEnrolled(courseData.enrolled || false);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Verify-on-return fallback for Stripe (works without webhook delivery)
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) return;
    (async () => {
      try {
        await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch {}
      router.replace(`/allsoullearn/courses/${id}`);
      load();
    })();
  }, [searchParams, router, id, load]);

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: id }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else if (data.error) alert(data.error);
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setEnrolling(false);
    }
  }

  if (loading) return <LoadingBlock />;

  if (!course) {
    return (
      <div className="section" style={{ textAlign: 'center', padding: 80 }}>
        <p className="display-th" style={{ fontSize: 22 }}>
          <T th="ไม่พบคอร์สนี้" en="Course not found" />
        </p>
        <div style={{ marginTop: 16 }}>
          <Btn kind="teal" href="/allsoullearn/courses">
            {tr(lang, 'กลับหน้าคอร์ส', 'Back to courses')}
          </Btn>
        </div>
      </div>
    );
  }

  const totalDuration = lessons.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="container">
        <Reveal style={{ marginBottom: 24 }}>
          <Link
            href="/allsoullearn/courses"
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              textDecoration: 'none',
            }}
          >
            ← {tr(lang, 'คอร์สทั้งหมด', 'All courses')}
          </Link>
        </Reveal>

        <div className="grid-x g-articles" style={{ gap: 40, alignItems: 'start' }}>
          {/* Left: hero + content */}
          <div>
            <Reveal>
              <div
                className="ph ph-teal"
                style={{
                  aspectRatio: '16 / 9',
                  borderRadius: 22,
                  marginBottom: 24,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {course.thumbnail_url ? (
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <>
                    <Cloud
                      color="var(--teal-200)"
                      stroke={3}
                      style={{ position: 'absolute', top: 20, right: 30, width: 90, height: 50 }}
                    />
                    <WaveLine
                      color="var(--teal)"
                      stroke={2.5}
                      style={{
                        position: 'absolute',
                        bottom: 24,
                        left: 24,
                        right: 24,
                        width: 'calc(100% - 48px)',
                        height: 30,
                      }}
                      count={3}
                    />
                  </>
                )}
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {course.category && <span className="tag">{course.category}</span>}
                <span className="tag tag-accent">
                  {LEVEL_LABEL[course.level]?.[lang] || course.level}
                </span>
              </div>
              <h1
                className="display-th"
                style={{ fontSize: 'clamp(28px, 4vw, 44px)', margin: '0 0 16px', lineHeight: 1.15 }}
              >
                {course.title}
              </h1>
              {course.description && (
                <p
                  style={{
                    fontSize: 16,
                    color: 'var(--ink-soft)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {course.description}
                </p>
              )}
            </Reveal>

            {/* Lessons */}
            <div style={{ marginTop: 48 }}>
              <Reveal>
                <span className="eyebrow">
                  01 — <T th="เนื้อหา" en="curriculum" />
                </span>
                <h2 className="display-th" style={{ fontSize: 'clamp(24px, 3vw, 32px)', margin: '14px 0 24px' }}>
                  <T
                    th={
                      <>
                        เนื้อหาคอร์ส{' '}
                        <span style={{ color: 'var(--teal)' }}>({lessons.length} บทเรียน)</span>
                      </>
                    }
                    en={
                      <>
                        Course content{' '}
                        <span style={{ color: 'var(--teal)' }}>
                          ({lessons.length} lesson{lessons.length === 1 ? '' : 's'})
                        </span>
                      </>
                    }
                  />
                </h2>
              </Reveal>

              {lessons.length === 0 ? (
                <Reveal style={{ padding: 32, background: 'var(--cream)', borderRadius: 16, textAlign: 'center' }}>
                  <p style={{ color: 'var(--muted)', margin: 0 }}>
                    <T th="ยังไม่มีบทเรียน" en="No lessons yet" />
                  </p>
                </Reveal>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lessons.map((lesson, index) => (
                    <Reveal
                      key={lesson.id}
                      variant="reveal"
                      delay={index * 50}
                      className="card card-cream"
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                      }}
                    >
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--teal)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'Archivo Black',
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
                          {lesson.title}
                        </p>
                        {lesson.duration_seconds ? (
                          <p
                            className="mono"
                            style={{
                              margin: '4px 0 0',
                              fontSize: 11,
                              color: 'var(--muted)',
                              letterSpacing: '.08em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {Math.floor(lesson.duration_seconds / 60)} {tr(lang, 'นาที', 'min')}
                          </p>
                        ) : null}
                      </div>
                      {lesson.is_preview ? (
                        <span className="tag tag-accent">{tr(lang, 'ดูฟรี', 'Free preview')}</span>
                      ) : enrolled ? (
                        <span className="tag">{tr(lang, 'ปลดล็อก', 'Unlocked')}</span>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--muted)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="4" y="11" width="16" height="10" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      )}
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: purchase card */}
          <div style={{ position: 'sticky', top: 96 }}>
            <Reveal variant="reveal-right">
              <article
                style={{
                  background: 'var(--ink)',
                  color: '#fff',
                  borderRadius: 24,
                  padding: 24,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {[0, 1, 2, 3, 4].map((k) => (
                    <Star key={k} color="var(--accent)" style={{ width: 16, height: 16 }} />
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#7f9794',
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    marginTop: 14,
                  }}
                >
                  {tr(lang, 'ราคา', 'Price')}
                </div>
                <div
                  style={{
                    fontFamily: 'Archivo Black',
                    fontSize: 44,
                    letterSpacing: '-.02em',
                    margin: '4px 0 18px',
                  }}
                >
                  ฿{course.price.toLocaleString()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
                  <FeatureRow
                    icon={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 8.5a2.5 2.5 0 0 1 2.5-2.5h15A2.5 2.5 0 0 1 22 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5z" />
                        <path d="m10 9 5 3-5 3z" fill="var(--accent)" />
                      </svg>
                    }
                    label={`${lessons.length} ${tr(lang, 'บทเรียน', 'lessons')}`}
                  />
                  {totalDuration > 0 && (
                    <FeatureRow
                      icon={
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      }
                      label={`${hours > 0 ? `${hours} ${tr(lang, 'ชม.', 'h')} ` : ''}${minutes} ${tr(
                        lang,
                        'นาที',
                        'min',
                      )}`}
                    />
                  )}
                  <FeatureRow
                    icon={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
                      </svg>
                    }
                    label={tr(lang, 'เรียนได้ตลอดชีพ', 'Lifetime access')}
                  />
                  <FeatureRow
                    icon={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="M3 9h18" />
                      </svg>
                    }
                    label={tr(lang, 'ดูบนอุปกรณ์ใดก็ได้', 'Watch on any device')}
                  />
                </div>

                {enrolled ? (
                  <Btn
                    kind="teal"
                    href={`/allsoullearn/courses/${id}/learn`}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {tr(lang, 'เข้าเรียน', 'Start learning')} →
                  </Btn>
                ) : (
                  <Btn
                    kind="paper"
                    onClick={handleEnroll}
                    disabled={enrolling}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {enrolling
                      ? tr(lang, 'กำลังดำเนินการ…', 'Processing…')
                      : tr(lang, 'ซื้อคอร์สนี้', 'Enroll now')}{' '}
                    →
                  </Btn>
                )}

                <p
                  style={{
                    fontSize: 12,
                    color: '#7f9794',
                    textAlign: 'center',
                    margin: '14px 0 0',
                    lineHeight: 1.5,
                  }}
                >
                  <T th="ชำระเงินผ่าน Stripe · ปลอดภัย" en="Secure checkout via Stripe" />
                </p>
              </article>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#cbd6d4' }}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
