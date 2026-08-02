'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Reveal } from '@/components/design/Reveal';
import { PublicCanvas } from '@/components/portfolio/builder/PublicCanvas';
import { CANVAS_W, type PortfolioDoc } from '@/lib/portfolio-builder';
import type { Portfolio } from '@/lib/types';

export default function PortfolioShowcasePage() {
  const { lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [doc, setDoc] = useState<PortfolioDoc | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me/portfolio');
        const data = (await res.json()) as { portfolio?: Portfolio };
        if (data.portfolio) {
          setPortfolio(data.portfolio);
          if (data.portfolio.doc_json) {
            try {
              setDoc(JSON.parse(data.portfolio.doc_json) as PortfolioDoc);
            } catch {
              setDoc(null);
            }
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    function fit() {
      if (!frameRef.current) return;
      setScale(Math.min(1, frameRef.current.clientWidth / CANVAS_W));
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [doc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  const nodeCount = doc?.nodes?.length || 0;
  const isEmpty = nodeCount === 0;
  const isPublished = portfolio?.published === 1;
  const previewH = (doc?.canvasH || 1700) * scale;

  return (
    <div className="space-y-7">
      {/* Heading */}
      <Reveal>
        <span className="eyebrow">
          <T th="ผลงาน" en="portfolio" />
        </span>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="display-th" style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.2, margin: '12px 0 6px' }}>
              <T th="Portfolio ของฉัน" en="My Portfolio" />
            </h1>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
              <T th="หน้าสะสมผลงานที่คุณออกแบบเอง" en="Your own designed showcase page" />
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPublished && portfolio && (
              <a href={`/p/${portfolio.id}`} target="_blank" rel="noreferrer" className="btn btn-paper btn-sm">
                <T th="ดูหน้าจริง" en="View live" /> <span className="mono">↗</span>
              </a>
            )}
            <Btn kind="teal" size="sm" href="/portfolio/edit">
              {isEmpty ? tr(lang, 'เริ่มสร้าง', 'Start building') : tr(lang, 'แก้ไข', 'Edit')} <span className="mono">→</span>
            </Btn>
          </div>
        </div>
      </Reveal>

      {/* Status bar */}
      <Reveal className="card card-static flex items-center gap-3 flex-wrap" style={{ padding: '14px 18px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: isPublished ? '#16a34a' : 'var(--muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isPublished ? '#16a34a' : '#cbd5d3', boxShadow: isPublished ? '0 0 0 4px rgba(22,163,74,.15)' : 'none' }} />
          {isPublished ? tr(lang, 'เผยแพร่แล้ว', 'Published') : tr(lang, 'ฉบับร่าง', 'Draft')}
        </span>
        <span style={{ color: 'var(--cream-deep)' }}>·</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {nodeCount} {tr(lang, 'องค์ประกอบ', 'elements')}
        </span>
        {isPublished && portfolio && (
          <>
            <span style={{ color: 'var(--cream-deep)' }}>·</span>
            <a href={`/p/${portfolio.id}`} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
              /p/{portfolio.id.slice(0, 8)}…
            </a>
          </>
        )}
      </Reveal>

      {/* Preview */}
      {isEmpty || !doc ? (
        <Reveal variant="reveal-zoom">
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: 'var(--ink)', color: '#fff', padding: '72px 32px', textAlign: 'center' }}>
            <h2 className="display-en" style={{ fontSize: 'clamp(40px, 7vw, 64px)', color: '#fff', margin: 0 }}>
              BUILD <span style={{ color: 'var(--accent)' }}>YOURS</span>
            </h2>
            <p style={{ fontSize: 14, color: '#9ab1ae', maxWidth: 360, margin: '14px auto 24px', lineHeight: 1.6 }}>
              <T th="ยังไม่มีผลงาน — เปิดตัวแก้ไขแบบ Canva สร้างหน้าของคุณได้เลย" en="Nothing here yet — open the Canva-style editor and build your page." />
            </p>
            <Btn kind="teal" href="/portfolio/edit">
              {tr(lang, 'เริ่มสร้าง Portfolio', 'Start building')} <span className="mono">→</span>
            </Btn>
          </div>
        </Reveal>
      ) : (
        <Reveal variant="reveal-zoom">
          <Link href="/portfolio/edit" style={{ display: 'block', textDecoration: 'none' }}>
            <div ref={frameRef} style={{ width: '100%', height: previewH, maxHeight: 560, overflow: 'hidden', borderRadius: 20, position: 'relative', background: 'var(--paper)' }}>
              <div style={{ width: CANVAS_W, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                <PublicCanvas doc={doc} interactive={false} animate={false} />
              </div>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 60%, rgba(13,30,29,.55))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 18 }}>
                <span className="btn btn-paper btn-sm" aria-hidden="true">
                  {tr(lang, 'คลิกเพื่อแก้ไข', 'Click to edit')} <span className="mono">→</span>
                </span>
              </div>
            </div>
          </Link>
        </Reveal>
      )}
    </div>
  );
}
