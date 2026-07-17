'use client';

import { useLang, T } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Cloud, Sparkle, WaveLine } from '@/components/design/Doodles';

export function SettingsPlaceholder({
  eyebrowTh,
  eyebrowEn,
  titleTh,
  titleEn,
  descTh,
  descEn,
}: {
  eyebrowTh?: string;
  eyebrowEn?: string;
  titleTh: string;
  titleEn: string;
  descTh: string;
  descEn: string;
}) {
  const { lang } = useLang();
  return (
    <div className="space-y-7">
      {/* Heading (home theme) */}
      <Reveal>
        <span className="eyebrow">{lang === 'th' ? eyebrowTh ?? titleTh : eyebrowEn ?? titleEn}</span>
        <h1 className="display-th" style={{ fontSize: 'clamp(30px, 4vw, 48px)', margin: '14px 0 8px' }}>
          {lang === 'th' ? titleTh : titleEn}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 520, margin: 0, lineHeight: 1.6 }}>
          {lang === 'th' ? descTh : descEn}
        </p>
      </Reveal>

      {/* Coming soon — ink banner with doodles */}
      <Reveal variant="reveal-zoom">
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 24,
            background: 'var(--ink)',
            color: '#fff',
            padding: '64px 32px',
            textAlign: 'center',
          }}
        >
          {/* Decorative doodles */}
          <Cloud
            color="var(--accent)"
            stroke={3}
            style={{ position: 'absolute', top: 28, right: '12%', width: 84, height: 48, opacity: 0.85 }}
          />
          <Sparkle color="var(--accent)" style={{ position: 'absolute', top: 40, left: '14%', width: 24 }} />
          <Sparkle color="var(--teal-200)" style={{ position: 'absolute', bottom: 44, right: '20%', width: 18 }} />
          <WaveLine
            color="var(--teal-200)"
            stroke={2.5}
            count={3}
            style={{ position: 'absolute', bottom: 24, left: 32, right: 32, width: 'calc(100% - 64px)', height: 26, opacity: 0.5 }}
          />

          <div style={{ position: 'relative' }}>
            <span
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
              }}
            >
              <T th="กำลังพัฒนา" en="in progress" />
            </span>
            <h2 className="display-en" style={{ fontSize: 'clamp(40px, 7vw, 72px)', color: '#fff', margin: '14px 0 0' }}>
              COMING
              <br />
              <span style={{ color: 'var(--accent)' }}>SOON</span>
            </h2>
            <div className="hand" style={{ color: 'var(--accent)', fontSize: 26, marginTop: 14 }}>
              <T th="อีกไม่นานนี้ ✺" en="not long now ✺" />
            </div>
            <p style={{ fontSize: 14, color: '#9ab1ae', maxWidth: 380, margin: '18px auto 0', lineHeight: 1.6 }}>
              <T
                th="ส่วนนี้กำลังอยู่ระหว่างการพัฒนา เรากำลังตั้งใจทำให้มันดีที่สุด"
                en="This section is under development — we're crafting it carefully."
              />
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
