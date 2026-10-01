'use client';

/* Canonical read-only renderer for a portfolio document — the single source of
 * truth shared by the editor Preview, the public /p/[id] page, and the showcase
 * thumbnail, so "Preview" and "Live" are identical. Renders PNodes at their
 * absolute positions on the logical 1200px canvas, replays the same animation
 * presets as the editor, and respects prefers-reduced-motion.
 */
import { useEffect, useRef } from 'react';
import { tr, type Lang } from '@/lib/i18n';
import {
  CANVAS_W,
  SHAPES,
  STICKER_MAP,
  CRED_MAP,
  SAMPLE_CREDENTIALS,
  fontStack,
  type PNode,
  type PortfolioDoc,
} from '@/lib/portfolio-builder';

/** Contact card from the node's snapshotted profile fields (set in the editor),
 *  falling back to a prompt when empty. Shared by editor + live render. */
export function contactView(node: PNode, lang: Lang) {
  const c = node.content || {};
  const name = (c.name as string) || '';
  const metas = [c.email, c.phone, c.line && `LINE ${c.line}`, c.ig && `IG ${c.ig}`].filter(Boolean) as string[];
  const empty = !name && metas.length === 0;
  return (
    <div className="pb-contact-card" style={{ color: node.styles?.color || 'inherit' }}>
      <div className="av">{(name || 'A').charAt(0).toUpperCase()}</div>
      <div style={{ minWidth: 0 }}>
        <div className="who">{name || tr(lang, 'ติดต่อฉันได้ที่', 'Get in touch with me')}</div>
        <div className="meta">
          {empty ? (
            <span>{tr(lang, 'เพิ่มข้อมูลติดต่อในแผงด้านขวา', 'Add contact info in the inspector')}</span>
          ) : (
            metas.map((m, i) => <span key={i}>{i === 0 ? m : `· ${m}`}</span>)
          )}
        </div>
      </div>
    </div>
  );
}

/** Credential badge from a snapshotted real workshop, falling back to the
 *  legacy sample (used by templates). Shared by editor + live render. */
export function credentialView(node: PNode, lang: Lang) {
  const snap = node.content?.cred as { th?: string; en?: string; date?: string; tone?: string } | undefined;
  const fb = CRED_MAP[node.content?.credId] || SAMPLE_CREDENTIALS[0];
  const title = snap ? (lang === 'th' ? snap.th || snap.en : snap.en || snap.th) || '' : tr(lang, fb.th, fb.en);
  const date = snap?.date || fb.date;
  const tone = snap?.tone || fb.tone || 'cream';
  return (
    <div className={`pb-credential-card tone-${tone}`}>
      <div>
        <div className="pb-cred-num">journey</div>
        <div className="pb-cred-title">{title}</div>
      </div>
      <div className="pb-cred-foot">
        <span>{date}</span>
        <span style={{ fontFamily: 'Caveat, Mitr', fontSize: 18 }}>completed ✓</span>
      </div>
      <div className="pb-cred-seal">✦</div>
    </div>
  );
}

export function animClassFor(preset?: string | null): string {
  switch (preset) {
    case 'fade-in': return 'pb-anim-fade-in';
    case 'rise': return 'pb-anim-rise';
    case 'zoom-in': return 'pb-anim-zoom-in';
    case 'slide-left': return 'pb-anim-slide-left';
    case 'slide-right': return 'pb-anim-slide-right';
    case 'float': return 'pb-anim-float';
    case 'pulse': return 'pb-anim-pulse';
    case 'magnetic': return 'pb-anim-magnetic';
    default: return '';
  }
}

/** Entrance presets that reveal on scroll-into-view. */
export const REVEAL_SELECTOR = '.pb-anim-fade-in, .pb-anim-rise, .pb-anim-zoom-in, .pb-anim-slide-left, .pb-anim-slide-right';
export function isRevealPreset(preset?: string | null): boolean {
  return preset === 'fade-in' || preset === 'rise' || preset === 'zoom-in' || preset === 'slide-left' || preset === 'slide-right';
}

function nodeContent(n: PNode, interactive: boolean) {
  const s = n.styles || {};
  switch (n.type) {
    case 'text':
      return (
        <div
          className="pb-text"
          style={{
            fontFamily: fontStack(s.fontFamily),
            fontSize: s.fontSize || 18,
            fontWeight: s.fontWeight || 400,
            color: s.color || 'inherit',
            textAlign: s.align || 'left',
            lineHeight: s.lineHeight || 1.4,
            letterSpacing: s.letterSpacing || 'normal',
          }}
        >
          {n.content?.text}
        </div>
      );
    case 'shape': {
      const sh = (SHAPES as Record<string, { clip: string; radius?: number }>)[n.content?.shape] || SHAPES.rect;
      return (
        <div
          className="pb-shape"
          style={{
            background: s.fill || '#0d8a7e',
            borderRadius: s.radius != null ? s.radius : sh.radius ?? 0,
            clipPath: sh.clip !== 'none' ? sh.clip : undefined,
            WebkitClipPath: sh.clip !== 'none' ? sh.clip : undefined,
          }}
        />
      );
    }
    case 'image': {
      const sh = (SHAPES as Record<string, { clip: string }>)[n.content?.shape] || SHAPES.rect;
      const src = n.content?.src as string | undefined;
      return (
        <div
          className="pb-image"
          style={{
            borderRadius: s.radius != null ? s.radius : 0,
            clipPath: sh.clip !== 'none' ? sh.clip : undefined,
            WebkitClipPath: sh.clip !== 'none' ? sh.clip : undefined,
            background: src ? undefined : 'var(--cream-deep)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" /> : null}
        </div>
      );
    }
    case 'sticker': {
      if (n.content?.userSrc)
        return (
          <div className="pb-sticker-node">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.content.userSrc} alt="" />
          </div>
        );
      const st = STICKER_MAP[n.content?.key];
      return <div className="pb-sticker-node" dangerouslySetInnerHTML={{ __html: st?.svg || '' }} />;
    }
    case 'link': {
      const linkStyle: React.CSSProperties = {
        background: s.fill || '#0d1e1d',
        color: s.color || '#fff',
        borderRadius: s.radius != null ? s.radius : 14,
        fontSize: s.fontSize || 15,
        fontWeight: s.fontWeight || 600,
        textAlign: s.align || 'center',
        padding: '0 18px',
      };
      // In a non-interactive context (showcase preview wrapped in a <Link>) we
      // must NOT emit a nested <a>; render a styled <div> instead.
      if (!interactive) {
        return (
          <div className="pb-link-node" style={linkStyle}>
            <span>{n.content?.text}</span>
          </div>
        );
      }
      return (
        <a className="pb-link-node" href={n.link?.href || '#'} target={n.link?.target || '_self'} rel="noopener" style={linkStyle}>
          <span>{n.content?.text}</span>
        </a>
      );
    }
    case 'contact':
      return contactView(n, 'th');
    case 'credential':
      return credentialView(n, 'th');
    case 'embed':
      return (
        <div className="pb-embed-frame" style={{ borderRadius: s.radius || 14 }}>
          <div className="icon-wrap">▶</div>
          <div>{n.content?.provider || 'media'}</div>
        </div>
      );
    default:
      return null;
  }
}

export function PublicCanvas({
  doc,
  interactive = true,
  animate = true,
}: {
  doc: PortfolioDoc;
  interactive?: boolean;
  /** Replay entrance/loop animations (off for static thumbnails). */
  animate?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodes = [...(doc.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
  const bgCls = doc.canvasBg ? `bg-${doc.canvasBg}` : '';

  // Same animation behavior as the editor preview: reveal rise/fade-in on
  // scroll, drive parallax from scroll. The global prefers-reduced-motion rule
  // already disables the CSS animations, so we only guard the JS bits here.
  useEffect(() => {
    if (!animate) return;
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const revealEls = root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR);
    if (reduced) {
      revealEls.forEach((el) => el.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    revealEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [animate, doc]);

  return (
    <div ref={rootRef} className="pb-app preview" style={{ position: 'static' }}>
      <div className="pb-stage" style={{ overflow: 'visible', background: 'var(--paper)' }}>
        <div className="pb-pan-layer" style={{ position: 'relative', left: 'auto', top: 'auto', transform: 'none', width: '100%' }}>
          <div
            className={`pb-canvas ${bgCls} ${animate ? '' : 'motion-off'}`}
            style={{ '--cw': CANVAS_W + 'px', '--ch': (doc.canvasH || 1700) + 'px', marginLeft: 'auto', marginRight: 'auto', marginTop: 0, borderRadius: 0, boxShadow: 'none' } as React.CSSProperties}
          >
            {nodes.map((n) => {
              const cls = animate ? animClassFor(n.animation?.preset) : '';
              return (
                <div
                  key={n.id}
                  className={`pb-node preview ${cls}`}
                  style={{
                    left: n.x,
                    top: n.y,
                    width: n.w,
                    height: n.h,
                    zIndex: n.z || 1,
                    opacity: n.opacity != null ? n.opacity : 1,
                    transform: n.rot ? `rotate(${n.rot}deg)` : undefined,
                    ['--rot' as string]: n.rot ? `${n.rot}deg` : '0deg',
                    animationDelay: n.animation?.delay ? `${n.animation.delay}ms` : undefined,
                    animationDuration: n.animation?.duration ? `${n.animation.duration}ms` : undefined,
                  } as React.CSSProperties}
                >
                  {nodeContent(n, interactive)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
