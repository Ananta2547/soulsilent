'use client';

/* Portfolio Builder — canvas engine (node renderer + pan/zoom stage).
 * Ported from soulsilent-portfolio-engine.jsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  CANVAS_W,
  SHAPES,
  STICKER_MAP,
  fontStack,
  type PNode,
} from '@/lib/portfolio-builder';
import { tr, type Lang } from '@/lib/i18n';
import { contactView, credentialView, animClassFor, isRevealPreset } from './PublicCanvas';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2.0;

/** Matched guide lines (canvas coords) shown while snapping. */
export type SnapGuides = { xs: number[]; ys: number[] };
/** Resolves a dragged box against canvas + sibling edges/centers. */
export type SnapResolver = (
  id: string,
  box: { x: number; y: number; w: number; h: number },
  tol: number,
) => { x: number; y: number; guides: SnapGuides };

/* ── animation: reveal when scrolled into view (preview) ── */
function useInView(ref: React.RefObject<HTMLElement | null>, motionOn: boolean) {
  // Start visible when motion is off, so non-animated nodes never hide.
  const [inView, set] = useState(!motionOn);
  useEffect(() => {
    if (!motionOn) return;
    const n = ref.current;
    if (!n) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          set(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(n);
    return () => io.disconnect();
  }, [motionOn, ref]);
  return inView;
}

/* ── per-type content ── */
function ShapeContent({ node }: { node: PNode }) {
  const sh = (SHAPES as Record<string, { clip: string; radius?: number }>)[node.content?.shape] || SHAPES.rect;
  const radius = node.styles?.radius != null ? node.styles.radius : sh.radius ?? 0;
  const fill = node.styles?.fill || '#0d8a7e';
  return (
    <div
      className="pb-shape"
      style={{
        background: fill,
        borderRadius: radius,
        clipPath: sh.clip !== 'none' ? sh.clip : undefined,
        WebkitClipPath: sh.clip !== 'none' ? sh.clip : undefined,
      }}
    />
  );
}

function TextContent({
  node,
  editing,
  onCommit,
}: {
  node: PNode;
  editing: boolean;
  onCommit?: (t: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);
  const s = node.styles || {};
  return (
    <div
      ref={ref}
      className="pb-text"
      contentEditable={editing}
      suppressContentEditableWarning
      onBlur={(e) => onCommit?.(e.currentTarget.innerText)}
      onMouseDown={(e) => {
        if (editing) e.stopPropagation();
      }}
      style={{
        fontFamily: fontStack(s.fontFamily),
        fontSize: s.fontSize || 18,
        fontWeight: s.fontWeight || 400,
        color: s.color || 'inherit',
        textAlign: s.align || 'left',
        lineHeight: s.lineHeight || 1.4,
        letterSpacing: s.letterSpacing || 'normal',
        fontStyle: s.italic ? 'italic' : 'normal',
      }}
    >
      {node.content?.text}
    </div>
  );
}

function ImageContent({ node }: { node: PNode }) {
  const sh = (SHAPES as Record<string, { clip: string }>)[node.content?.shape] || SHAPES.rect;
  const radius = node.styles?.radius != null ? node.styles.radius : 0;
  const src = node.content?.src as string | undefined;
  return (
    <div
      className="pb-image"
      style={{
        borderRadius: radius,
        opacity: node.styles?.opacity != null ? node.styles.opacity : 1,
        clipPath: sh.clip !== 'none' ? sh.clip : undefined,
        WebkitClipPath: sh.clip !== 'none' ? sh.clip : undefined,
        overflow: 'hidden',
        background: src ? undefined : 'var(--cream-deep)',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontFamily: 'JetBrains Mono,IBM Plex Sans Thai, monospace',
            fontSize: 11,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          {node.content?.placeholder || 'image'}
        </div>
      )}
    </div>
  );
}

function StickerContent({ node }: { node: PNode }) {
  const s = STICKER_MAP[node.content?.key] || Object.values(STICKER_MAP)[0];
  if (node.content?.userSrc) {
    return (
      <div className="pb-sticker-node">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.content.userSrc} alt="" />
      </div>
    );
  }
  return <div className="pb-sticker-node" dangerouslySetInnerHTML={{ __html: s?.svg || '' }} />;
}

function LinkContent({ node, preview }: { node: PNode; preview: boolean }) {
  const s = node.styles || {};
  return (
    <a
      className="pb-link-node"
      href={node.link?.href || '#'}
      target={node.link?.target || '_self'}
      rel="noopener"
      onClick={(e) => {
        if (!preview) e.preventDefault();
      }}
      style={{
        background: s.fill || '#0d1e1d',
        color: s.color || '#fff',
        borderRadius: s.radius != null ? s.radius : 14,
        fontSize: s.fontSize || 15,
        fontWeight: s.fontWeight || 600,
        fontFamily: fontStack(s.fontFamily, 'IBM Plex Sans Thai, Mitr, sans-serif'),
        textAlign: s.align || 'center',
        padding: s.padding || '0 18px',
      }}
    >
      <span>{node.content?.text}</span>
    </a>
  );
}

function ContactContent({ node, lang }: { node: PNode; lang: Lang }) {
  return contactView(node, lang);
}

function CredentialContent({ node, lang }: { node: PNode; lang: Lang }) {
  return credentialView(node, lang);
}

function EmbedContent({ node, lang }: { node: PNode; lang: Lang }) {
  const p = node.content?.provider || 'youtube';
  const iconBy: Record<string, string> = { youtube: '▶', spotify: '♫', audio: '🎧' };
  const labelBy: Record<string, string> = { youtube: 'YouTube embed', spotify: 'Spotify track', audio: 'Audio clip' };
  return (
    <div className="pb-embed-frame" style={{ borderRadius: node.styles?.radius || 14 }}>
      <div className="icon-wrap">{iconBy[p] || '▶'}</div>
      <div>{labelBy[p]}</div>
      <div style={{ fontSize: 10, opacity: 0.55, maxWidth: '85%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.content?.url || tr(lang, 'แตะเพื่อใส่ลิงก์', 'Tap to add URL')}
      </div>
    </div>
  );
}

/* ── master node ── */
export function CanvasNode({
  node,
  selected,
  preview,
  motionOn,
  editingTextId,
  lang,
  zoom,
  onSelect,
  onChangeLive,
  onInteractionStart,
  onCommitText,
  onContextMenu,
  snap,
  onSnapChange,
}: {
  node: PNode;
  selected: boolean;
  preview: boolean;
  motionOn: boolean;
  editingTextId: string | null;
  lang: Lang;
  zoom: number;
  onSelect: (id: string | null) => void;
  onChangeLive: (id: string, patch: Partial<PNode>) => void;
  onInteractionStart: () => void;
  onCommitText: (id: string, text: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  snap?: SnapResolver;
  onSnapChange?: (g: SnapGuides) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, motionOn);
  const anim = node.animation || {};

  const animClass = preview && motionOn ? animClassFor(anim.preset) : '';

  const wrapStyle: React.CSSProperties & Record<string, string | number | undefined> = {
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    zIndex: node.z || 1,
    opacity: node.opacity != null ? node.opacity : 1,
    transform: node.rot ? `rotate(${node.rot}deg)` : undefined,
    '--rot': node.rot ? `${node.rot}deg` : '0deg',
    animationDelay: anim.delay ? `${anim.delay}ms` : undefined,
    animationDuration: anim.duration ? `${anim.duration}ms` : undefined,
  };

  const needsInView = motionOn && preview && isRevealPreset(anim.preset);
  const inViewCls = needsInView ? (inView ? 'in-view' : '') : '';

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (preview) return;
      if ((e.target as HTMLElement).closest('.pb-handle')) return;
      if (editingTextId === node.id) return;
      if (e.button !== 0 || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(node.id);
      // Locked nodes are selectable (so they can be unlocked) but never dragged.
      if (node.locked) return;
      const startX = e.clientX, startY = e.clientY;
      const sx = node.x, sy = node.y;
      const sc = zoom || 1;
      const tol = 7 / sc; // ~7px magnet zone regardless of zoom
      let started = false;
      const move = (ev: MouseEvent) => {
        // Snapshot the pre-drag position once, on the first actual movement, so
        // a pure click creates no history and one Undo returns to point A.
        if (!started) {
          onInteractionStart();
          started = true;
        }
        let nx = Math.round(sx + (ev.clientX - startX) / sc);
        let ny = Math.round(sy + (ev.clientY - startY) / sc);

        // Snap edges/centers to the canvas + sibling elements (Figma-style).
        if (snap) {
          const r = snap(node.id, { x: nx, y: ny, w: node.w, h: node.h }, tol);
          nx = r.x;
          ny = r.y;
          onSnapChange?.(r.guides);
        }
        onChangeLive(node.id, { x: nx, y: ny });
      };
      const up = () => {
        onSnapChange?.({ xs: [], ys: [] });
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [node.id, node.x, node.y, node.w, node.h, node.locked, preview, editingTextId, zoom, snap, onChangeLive, onInteractionStart, onSnapChange, onSelect],
  );

  const onResizeStart = useCallback(
    (dir: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const { x, y, w, h } = node;
      const sc = zoom || 1;
      let started = false;
      const move = (ev: MouseEvent) => {
        if (!started) {
          onInteractionStart();
          started = true;
        }
        const dx = (ev.clientX - startX) / sc;
        const dy = (ev.clientY - startY) / sc;
        let nx = x, ny = y, nw = w, nh = h;
        if (dir.includes('e')) nw = Math.max(24, w + dx);
        if (dir.includes('s')) nh = Math.max(24, h + dy);
        if (dir.includes('w')) { nw = Math.max(24, w - dx); nx = x + (w - nw); }
        if (dir.includes('n')) { nh = Math.max(24, h - dy); ny = y + (h - nh); }
        onChangeLive(node.id, { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) });
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [node, zoom, onChangeLive, onInteractionStart],
  );

  const onRotateStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = ref.current!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startAng = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      const r0 = node.rot || 0;
      let started = false;
      const move = (ev: MouseEvent) => {
        if (!started) {
          onInteractionStart();
          started = true;
        }
        const ang = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
        onChangeLive(node.id, { rot: Math.round(r0 + (ang - startAng)) });
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [node, onChangeLive, onInteractionStart],
  );

  const editing = editingTextId === node.id;
  const content = (() => {
    switch (node.type) {
      case 'text': return <TextContent node={node} editing={editing} onCommit={(t) => onCommitText(node.id, t)} />;
      case 'shape': return <ShapeContent node={node} />;
      case 'image': return <ImageContent node={node} />;
      case 'sticker': return <StickerContent node={node} />;
      case 'link': return <LinkContent node={node} preview={preview} />;
      case 'contact': return <ContactContent node={node} lang={lang} />;
      case 'credential': return <CredentialContent node={node} lang={lang} />;
      case 'embed': return <EmbedContent node={node} lang={lang} />;
      default: return null;
    }
  })();

  return (
    <div
      ref={ref}
      className={`pb-node ${animClass} ${inViewCls} ${preview ? 'preview' : ''} ${node.locked ? 'locked' : ''}`}
      data-selected={selected ? 'true' : 'false'}
      data-nid={node.id}
      style={wrapStyle}
      onMouseDown={onDragStart}
      onContextMenu={preview ? undefined : (e) => onContextMenu?.(e, node.id)}
      onDoubleClick={(e) => {
        if (preview || node.locked) return;
        if (node.type === 'text') {
          e.stopPropagation();
          onSelect(node.id);
          onCommitText(node.id, '__edit__');
        }
      }}
    >
      {content}
      {selected && !preview && !editing && !node.locked && (
        <>
          {(['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'] as const).map((d) => (
            <div key={d} className="pb-handle" data-dir={d} onMouseDown={onResizeStart(d)} />
          ))}
          <div className="pb-handle rot" data-dir="rot" onMouseDown={onRotateStart} />
        </>
      )}
      {selected && !preview && node.locked && <div className="pb-lock-badge" aria-hidden>🔒</div>}
    </div>
  );
}

/* ── stage with pan/zoom ── */
export function CanvasStage({
  nodes,
  selectedId,
  editingTextId,
  preview,
  gridStyle,
  motionOn,
  canvasH,
  canvasBg,
  lang,
  device,
  zoom,
  pan,
  spaceDown,
  panning,
  onZoomChange,
  onPanChange,
  onSpaceChange,
  onPanningChange,
  onSelect,
  onChangeLive,
  onInteractionStart,
  onCommitText,
  onContextMenu,
  stageRef,
}: {
  nodes: PNode[];
  selectedId: string | null;
  editingTextId: string | null;
  preview: boolean;
  gridStyle: string;
  motionOn: boolean;
  canvasH: number;
  canvasBg: string;
  lang: Lang;
  device: string;
  zoom: number;
  pan: { x: number; y: number };
  spaceDown: boolean;
  panning: boolean;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  onSpaceChange: (v: boolean) => void;
  onPanningChange: (v: boolean) => void;
  onSelect: (id: string | null) => void;
  onChangeLive: (id: string, patch: Partial<PNode>) => void;
  onInteractionStart: () => void;
  onCommitText: (id: string, text: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string | null) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = stageRef;
  const fittedRef = useRef(false);

  useLayoutEffect(() => {
    if (preview || fittedRef.current) return;
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const fit = Math.min(0.95, Math.min(w / (CANVAS_W + 120), h / (canvasH + 100)));
    onZoomChange(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit)));
    onPanChange({ x: 0, y: 0 });
    fittedRef.current = true;
  }, [preview, canvasH, ref, onZoomChange, onPanChange]);

  // Ctrl/Cmd + wheel = zoom around cursor
  useEffect(() => {
    if (preview) return;
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const delta = -e.deltaY * 0.0018;
      const z0 = zoom;
      const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * (1 + delta)));
      const k = z1 / z0;
      onZoomChange(z1);
      onPanChange({ x: cx - k * (cx - pan.x), y: cy - k * (cy - pan.y) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [preview, zoom, pan.x, pan.y, ref, onZoomChange, onPanChange]);

  // Space to pan
  useEffect(() => {
    if (preview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input,textarea,[contenteditable="true"]')) {
        if (!spaceDown) {
          onSpaceChange(true);
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        onSpaceChange(false);
        onPanningChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [preview, spaceDown, onSpaceChange, onPanningChange]);

  // Touch: pinch-to-zoom (2 fingers, around the gesture midpoint) + one-finger
  // pan on empty canvas. Touch-only so the mouse/space/middle paths are intact.
  useEffect(() => {
    if (preview) return;
    const el = ref.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let base: { dist: number; zoom: number; panX: number; panY: number; cx: number; cy: number } | null = null;
    let panStart: { x: number; y: number; panX: number; panY: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        const t = e.target as HTMLElement;
        if (t.classList.contains('pb-stage') || t.classList.contains('pb-pan-layer') || t.classList.contains('pb-canvas')) {
          panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }
      } else if (pts.size === 2) {
        panStart = null;
        const [a, b] = [...pts.values()];
        const rect = el.getBoundingClientRect();
        base = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          zoom,
          panX: pan.x,
          panY: pan.y,
          cx: (a.x + b.x) / 2 - rect.left - rect.width / 2,
          cy: (a.y + b.y) / 2 - rect.top - rect.height / 2,
        };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && base) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, base.zoom * (dist / base.dist)));
        const k = z1 / base.zoom;
        onZoomChange(z1);
        onPanChange({ x: base.cx - k * (base.cx - base.panX), y: base.cy - k * (base.cy - base.panY) });
      } else if (pts.size === 1 && panStart) {
        onPanChange({ x: panStart.panX + (e.clientX - panStart.x), y: panStart.panY + (e.clientY - panStart.y) });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.delete(e.pointerId);
      if (pts.size < 2) base = null;
      if (pts.size === 0) panStart = null;
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [preview, zoom, pan.x, pan.y, ref, onZoomChange, onPanChange]);

  const onMouseDownStage = useCallback(
    (e: React.MouseEvent) => {
      if (preview) return;
      const isMid = e.button === 1;
      const isSpace = spaceDown && e.button === 0;
      if (!isMid && !isSpace) {
        const t = e.target as HTMLElement;
        if (t.classList.contains('pb-stage') || t.classList.contains('pb-pan-layer')) onSelect(null);
        return;
      }
      e.preventDefault();
      onPanningChange(true);
      const startX = e.clientX, startY = e.clientY;
      const p0 = { x: pan.x, y: pan.y };
      const move = (ev: MouseEvent) => onPanChange({ x: p0.x + (ev.clientX - startX), y: p0.y + (ev.clientY - startY) });
      const up = () => {
        onPanningChange(false);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [preview, spaceDown, pan.x, pan.y, onPanChange, onPanningChange, onSelect],
  );

  const sorted = useMemo(() => [...nodes].sort((a, b) => (a.z || 0) - (b.z || 0)), [nodes]);
  const bgCls = canvasBg ? `bg-${canvasBg}` : '';
  const previewMobile = preview && device === 'mobile';

  // Smart-guide lines (canvas coords) shown while a node snaps.
  const [guides, setGuides] = useState<SnapGuides>({ xs: [], ys: [] });

  // Resolve a dragged box against the canvas edges/center + every sibling's
  // edges/center; snap the nearest matching anchor and report guide lines.
  const resolveSnap = useCallback<SnapResolver>(
    (id, box, tol) => {
      const xLines = [0, CANVAS_W / 2, CANVAS_W];
      const yLines = [0, canvasH / 2, canvasH];
      for (const n of nodes) {
        if (n.id === id) continue;
        xLines.push(n.x, n.x + n.w / 2, n.x + n.w);
        yLines.push(n.y, n.y + n.h / 2, n.y + n.h);
      }
      // Dragged anchors: left/center/right and top/middle/bottom.
      const ax = [box.x, box.x + box.w / 2, box.x + box.w];
      const ay = [box.y, box.y + box.h / 2, box.y + box.h];

      const pick = (anchors: number[], lines: number[]) => {
        let best: { delta: number; line: number } | null = null;
        for (const a of anchors) {
          for (const line of lines) {
            const delta = line - a;
            if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) {
              best = { delta, line };
            }
          }
        }
        return best;
      };

      const bx = pick(ax, xLines);
      const by = pick(ay, yLines);
      return {
        x: bx ? Math.round(box.x + bx.delta) : box.x,
        y: by ? Math.round(box.y + by.delta) : box.y,
        guides: { xs: bx ? [bx.line] : [], ys: by ? [by.line] : [] },
      };
    },
    [nodes, canvasH],
  );

  const stageCls = [
    'pb-stage',
    !preview && (gridStyle === 'dot' ? 'grid-dot' : gridStyle === 'line' ? 'grid-line' : ''),
    spaceDown && 'space-down',
    panning && 'panning',
  ]
    .filter(Boolean)
    .join(' ');

  const canvasMarkup = (
    <div
      className={`pb-canvas ${bgCls} ${motionOn ? '' : 'motion-off'}`}
      style={{ '--cw': CANVAS_W + 'px', '--ch': canvasH + 'px' } as React.CSSProperties}
    >
      {sorted.map((n) => (
        <CanvasNode
          key={n.id}
          node={n}
          selected={n.id === selectedId}
          editingTextId={editingTextId}
          preview={preview}
          motionOn={motionOn}
          lang={lang}
          zoom={zoom}
          onSelect={onSelect}
          onChangeLive={onChangeLive}
          onInteractionStart={onInteractionStart}
          onCommitText={onCommitText}
          onContextMenu={onContextMenu}
          snap={preview ? undefined : resolveSnap}
          onSnapChange={preview ? undefined : setGuides}
        />
      ))}

      {/* Smart guides — alignment lines, shown only while snapping (design). */}
      {!preview &&
        guides.xs.map((x, i) => <div key={`gx${i}`} className="pb-guide v" style={{ left: x }} />)}
      {!preview &&
        guides.ys.map((y, i) => <div key={`gy${i}`} className="pb-guide h" style={{ top: y }} />)}
    </div>
  );

  return (
    <div
      ref={ref}
      className={stageCls}
      style={preview ? undefined : { touchAction: 'none' }}
      onMouseDown={onMouseDownStage}
      onContextMenu={
        preview
          ? undefined
          : (e) => {
              const t = e.target as HTMLElement;
              // Only the bare stage/pan-layer opens the empty-area (paste) menu;
              // node right-clicks are handled on the node and stop propagation.
              if (t.classList.contains('pb-stage') || t.classList.contains('pb-pan-layer') || t.classList.contains('pb-canvas')) {
                onContextMenu?.(e, null);
              }
            }
      }
    >
      {preview ? (
        previewMobile ? (
          <div className="pb-mobile-frame">
            <div className="pb-mobile-inner">{canvasMarkup}</div>
          </div>
        ) : (
          <div className="pb-pan-layer" style={{ width: '100%' }}>
            {canvasMarkup}
          </div>
        )
      ) : (
        <div className="pb-pan-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {canvasMarkup}
        </div>
      )}
    </div>
  );
}
