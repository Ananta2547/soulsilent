'use client';

/* Portfolio Builder — workspace UI (top bar, left palette, inspector, owner nav).
 * Ported from soulsilent-portfolio-ui.jsx.
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { tr, pick, type Lang } from '@/lib/i18n';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import type { ImageMeta } from '@/lib/types';
import {
  PALETTE,
  STICKERS,
  SHAPES,
  ANIM_PRESETS,
  SAMPLE_CREDENTIALS,
  type PNode,
  type PortfolioDoc,
} from '@/lib/portfolio-builder';
import { ZOOM_MIN, ZOOM_MAX } from './CanvasEngine';

/* ── layer label / glyph ── */
function layerLabel(n: PNode, lang: Lang): string {
  if (n.type === 'text') return (n.content?.text || '').slice(0, 24) || tr(lang, 'ตัวอักษร', 'Text');
  if (n.type === 'shape') return tr(lang, 'รูปร่าง · ', 'Shape · ') + (n.content?.shape || 'rect');
  if (n.type === 'image') return tr(lang, 'ภาพ · ', 'Image · ') + (n.content?.shape || 'rect');
  if (n.type === 'sticker') return tr(lang, 'สติกเกอร์', 'Sticker');
  if (n.type === 'link') return tr(lang, 'ลิงก์ · ', 'Link · ') + (n.content?.text || '');
  if (n.type === 'contact') return tr(lang, 'การ์ดติดต่อ', 'Contact card');
  if (n.type === 'credential') return tr(lang, 'เหรียญ', 'Credential');
  if (n.type === 'embed') return tr(lang, 'มีเดีย · ', 'Media · ') + (n.content?.provider || '');
  return n.type;
}

function fmtCredDate(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function Glyph({ kind, sub }: { kind: string; sub?: string }) {
  const c = 'var(--teal-deep)';
  if (kind === 'sticker') return <span style={{ fontSize: 18 }}>✦</span>;
  if (kind === 'embed') return <span style={{ fontSize: 16, color: c }}>▶</span>;
  if (kind === 'shape') {
    const map: Record<string, string> = { rect: '▭', circle: '●', blob: '❀', star: '★', arch: '⌒', diamond: '◆', pill: '▬', hex: '⬡', ellipse: '⬭' };
    return <span style={{ fontSize: 18, color: c }}>{map[sub || 'rect'] || '▭'}</span>;
  }
  const iconMap: Record<string, string> = { text: '✎', image: '🖼', link: '↗', contact: '◌', credential: '✦' };
  return <span style={{ fontSize: 16, color: c }}>{iconMap[kind] || '·'}</span>;
}

/* ── Top bar (design) ── */
export function DesignTopBar({
  lang,
  pf,
  setMode,
  showLeft,
  setShowLeft,
  showRight,
  setShowRight,
  zen,
  setZen,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onCopyURL,
  onToggleVisibility,
  shareId,
  saveState,
}: {
  lang: Lang;
  pf: PortfolioDoc;
  setMode: (m: string) => void;
  showLeft: boolean;
  setShowLeft: (v: boolean) => void;
  showRight: boolean;
  setShowRight: (v: boolean) => void;
  zen: boolean;
  setZen: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCopyURL: () => void;
  onToggleVisibility: () => void;
  shareId: string | null;
  saveState: 'saved' | 'unsaved' | 'saving';
}) {
  return (
    <header className="pb-bar">
      <Link href="/me/portfolio" className="pb-logo" title={tr(lang, 'กลับสู่ Portfolio', 'Back to portfolio')}>
        <span className="mark">s</span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="word">
            soulsilent<span className="dot">.</span>
          </span>
          <span className="back">← back</span>
        </span>
      </Link>
      <span className="pb-bar-sep" />

      <div className="pb-proj">
        <span className="name">{tr(lang, 'Portfolio ของฉัน', 'My Portfolio')}</span>
        <span className="meta">
          {saveState === 'saving'
            ? tr(lang, 'กำลังบันทึก…', 'Saving…')
            : saveState === 'unsaved'
              ? tr(lang, 'ยังไม่บันทึก', 'Unsaved')
              : tr(lang, 'บันทึกอัตโนมัติแล้ว ✓', 'Saved ✓')}
        </span>
      </div>

      <button
        className={`pb-status ${pf.visibility === 'public' ? 'public' : ''}`}
        onClick={onToggleVisibility}
        title={tr(lang, 'สลับสถานะเผยแพร่', 'Toggle visibility')}
      >
        <span className="dot" />
        {pf.visibility === 'public' ? tr(lang, 'สาธารณะ', 'Public') : tr(lang, 'ส่วนตัว', 'Private')}
      </button>

      <div className="pb-share-input" title={tr(lang, 'ลิงก์แชร์', 'Share link')}>
        <span>/p/</span>
        <input
          value={shareId || tr(lang, '— บันทึกก่อน —', '— save first —')}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <button onClick={onCopyURL} disabled={!shareId}>{tr(lang, 'คัดลอก', 'Copy')}</button>
      </div>

      <span className="pb-bar-spacer" />

      <button className="pb-iconbtn" onClick={onUndo} disabled={!canUndo} title="Undo · Ctrl+Z">↶</button>
      <button className="pb-iconbtn" onClick={onRedo} disabled={!canRedo} title="Redo · Ctrl+Shift+Z">↷</button>
      <span className="pb-bar-sep" />

      <button className={`pb-iconbtn ${showLeft ? '' : 'on'}`} onClick={() => setShowLeft(!showLeft)} title={tr(lang, 'แผงซ้าย', 'Toggle left')}>
        {showLeft ? '⫷' : '⫸'}
      </button>
      <button className={`pb-iconbtn ${showRight ? '' : 'on'}`} onClick={() => setShowRight(!showRight)} title={tr(lang, 'แผงขวา', 'Toggle right')}>
        {showRight ? '⫸' : '⫷'}
      </button>
      <button className={`pb-iconbtn ${zen ? 'on' : ''}`} onClick={() => setZen(!zen)} title={tr(lang, 'โหมด Zen (Tab)', 'Zen (Tab)')}>⌖</button>

      <span className="pb-bar-sep" />

      <button className="pb-iconbtn" onClick={onSave} title={tr(lang, 'บันทึก', 'Save')} style={{ width: 'auto', padding: '0 14px', background: 'var(--cream)' }}>
        {tr(lang, 'บันทึก', 'Save')}
      </button>
      <button className="pb-preview-btn" onClick={() => setMode('preview')}>
        <span className="dot" />
        {tr(lang, 'ดูตัวอย่าง', 'Preview')} →
      </button>
    </header>
  );
}

/* ── Layers list (pointer-drag sortable, zero-dep) ── */
function LayersList({
  nodes,
  selectedId,
  lang,
  onSelect,
  onReorder,
  onToggleLock,
}: {
  nodes: PNode[];
  selectedId: string | null;
  lang: Lang;
  onSelect: (id: string) => void;
  onReorder: (idsTopToBottom: string[]) => void;
  onToggleLock: (id: string) => void;
}) {
  const ordered = [...nodes].sort((a, b) => (b.z || 0) - (a.z || 0)); // top of stack first
  const orderedIds = ordered.map((n) => n.id);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const rowEls = useRef<Record<string, HTMLDivElement | null>>({});
  const overRef = useRef<string | null>(null);

  const commit = (drag: string, over: string | null) => {
    if (!over || over === drag) return;
    const ids = [...orderedIds];
    const from = ids.indexOf(drag);
    const to = ids.indexOf(over);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, drag);
    onReorder(ids);
  };

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragId(id);
    overRef.current = id;
    setOverId(id);
    const move = (ev: PointerEvent) => {
      const y = ev.clientY;
      for (const rid of orderedIds) {
        const el = rowEls.current[rid];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          overRef.current = rid;
          setOverId(rid);
          break;
        }
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit(id, overRef.current);
      setDragId(null);
      setOverId(null);
      overRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const moveOne = (id: string, dir: 'up' | 'down') => {
    const ids = [...orderedIds];
    const i = ids.indexOf(id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(ids);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {ordered.map((n) => (
        <div
          key={n.id}
          ref={(el) => {
            rowEls.current[n.id] = el;
          }}
          className={`pb-layer ${dragId === n.id ? 'dragging' : ''} ${overId === n.id && dragId && dragId !== n.id ? 'over' : ''}`}
          aria-current={n.id === selectedId ? 'true' : 'false'}
          tabIndex={0}
          onClick={() => onSelect(n.id)}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              moveOne(n.id, e.key === 'ArrowUp' ? 'up' : 'down');
            }
          }}
        >
          <span
            className="pb-layer-handle"
            onPointerDown={startDrag(n.id)}
            onClick={(e) => e.stopPropagation()}
            title={tr(lang, 'ลากเพื่อย้าย', 'Drag to reorder')}
            aria-hidden
          >
            ⋮⋮
          </span>
          <span className="ico">
            <Glyph kind={n.type} sub={n.content?.shape || n.content?.key} />
          </span>
          <span className="lbl">{layerLabel(n, lang)}</span>
          <button
            type="button"
            className={`pb-layer-lock ${n.locked ? 'on' : ''}`}
            aria-label={n.locked ? tr(lang, 'ปลดล็อก', 'Unlock') : tr(lang, 'ล็อก', 'Lock')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(n.id);
            }}
          >
            {n.locked ? '🔒' : '🔓'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Left panel ── */
export function LeftPanel({
  nodes,
  selectedId,
  lang,
  open,
  onAdd,
  onAddSticker,
  onUploadSticker,
  onReorderLayers,
  onToggleLock,
  onSelect,
}: {
  nodes: PNode[];
  selectedId: string | null;
  lang: Lang;
  open: boolean;
  onAdd: (it: (typeof PALETTE)[number]['items'][number]) => void;
  onAddSticker: (key: string) => void;
  onUploadSticker: (file: File) => void;
  onReorderLayers: (idsTopToBottom: string[]) => void;
  onToggleLock: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<'elements' | 'stickers' | 'layers'>('elements');
  return (
    <aside className={`pb-left ${open ? '' : 'closed'}`} aria-hidden={!open}>
      <div className="pb-left-tabs">
        <button className={tab === 'elements' ? 'on' : ''} onClick={() => setTab('elements')}>{tr(lang, 'องค์ประกอบ', 'Elements')}</button>
        <button className={tab === 'stickers' ? 'on' : ''} onClick={() => setTab('stickers')}>{tr(lang, 'สติกเกอร์', 'Stickers')}</button>
        <button className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>{tr(lang, 'เลเยอร์', 'Layers')}</button>
      </div>
      <div className="pb-left-body">
        {tab === 'elements' &&
          PALETTE.map((g, gi) => (
            <div className="pb-group" key={gi}>
              <h4>{pick(g.group, lang)}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map((it, ii) => (
                  <button key={ii} className="pb-tile" onClick={() => onAdd(it)}>
                    <span className="glyph">
                      <Glyph kind={it.kind} sub={it.sub} />
                    </span>
                    <span className="lbl">
                      {pick({ th: it.th, en: it.en }, lang)}
                      <div className="sub">{it.sub}</div>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

        {tab === 'stickers' && (
          <>
            <div className="pb-group">
              <h4>SoulSilent doodle pack</h4>
              <div className="pb-sticker-grid">
                {STICKERS.map((s) => (
                  <button
                    key={s.key}
                    className="pb-sticker"
                    title={pick({ th: s.th, en: s.en }, lang)}
                    onClick={() => onAddSticker(s.key)}
                    dangerouslySetInnerHTML={{ __html: s.svg }}
                  />
                ))}
              </div>
            </div>
            <div className="pb-group">
              <h4>{tr(lang, 'อัปโหลดของคุณ', 'Your uploads')}</h4>
              <label className="pb-drop">
                <b>{tr(lang, 'เลือก PNG / SVG', 'Pick PNG / SVG')}</b>
                {tr(lang, 'คลิกเพื่อเลือกไฟล์', 'click to pick a file')}
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadSticker(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </>
        )}

        {tab === 'layers' && (
          <div className="pb-group">
            <h4>
              {tr(lang, 'ทั้งหมด', 'All layers')} · {nodes.length}
            </h4>
            <LayersList
              nodes={nodes}
              selectedId={selectedId}
              lang={lang}
              onSelect={onSelect}
              onReorder={onReorderLayers}
              onToggleLock={onToggleLock}
            />
            <p className="pb-layers-hint">{tr(lang, 'ลากเพื่อจัดลำดับ · Alt+↑/↓', 'Drag to reorder · Alt+↑/↓')}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Inspector ── */
const SWATCH_PALETTE = ['#0d1e1d', '#0d8a7e', '#075a51', '#a5d9d1', '#f5c243', '#f59e7a', '#d35d52', '#f6f1e6', '#ede5cf', '#ffffff', 'transparent'];

function NumFld({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <div className="pb-fld">
      <span className="label">{label}</span>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span className="label">{suffix}</span>}
    </div>
  );
}
function SliderFld({ label, value, min = 0, max = 1, step = 0.05, fmt, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="lbl" style={{ fontSize: 10, marginBottom: 4 }}>{label}</div>
      <div className="pb-slider-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="v">{fmt ? fmt(value) : value}</span>
      </div>
    </div>
  );
}
function Swatches({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <div className="pb-swatch-row">
      {SWATCH_PALETTE.map((c) => (
        <button
          key={c}
          className={`pb-swatch ${value === c ? 'on' : ''}`}
          onClick={() => onPick(c)}
          title={c}
          style={{ background: c === 'transparent' ? 'repeating-linear-gradient(45deg, #eee, #eee 4px, #fff 4px, #fff 8px)' : c }}
        />
      ))}
    </div>
  );
}

export function Inspector({
  node,
  open,
  lang,
  onChange,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  credentials,
  profile,
}: {
  node: PNode | null;
  open: boolean;
  lang: Lang;
  onChange: (id: string, patch: Partial<PNode>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onToggleLock: (id: string) => void;
  credentials: { id: string; title: string; date: string; attended: number }[];
  profile: { name?: string; email?: string; phone?: string } | null;
}) {
  if (!open) return null;
  if (!node)
    return (
      <aside className="pb-right">
        <div className="pb-insp-head">
          <div className="ttl">{tr(lang, 'inspector', 'Inspector')}</div>
          <div className="sub">{tr(lang, 'ไม่มีองค์ประกอบที่เลือก', 'Nothing selected')}</div>
        </div>
        <div className="pb-insp-empty">
          <div className="glyph">✦</div>
          <div>{tr(lang, 'คลิกองค์ประกอบบนแคนวาส', 'Click any element on the canvas')}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <kbd>Space</kbd>+drag {tr(lang, 'แพน', 'to pan')}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <kbd>Ctrl</kbd>+wheel {tr(lang, 'ซูม', 'to zoom')}
          </div>
        </div>
      </aside>
    );

  const s = node.styles || {};
  const setStyle = (patch: Record<string, unknown>) => onChange(node.id, { styles: { ...s, ...patch } });
  const setAnim = (patch: Record<string, unknown>) => onChange(node.id, { animation: { ...(node.animation || {}), ...patch } });
  const setLink = (patch: Record<string, unknown>) => onChange(node.id, { link: { ...(node.link || {}), ...patch } });
  const setContent = (patch: Record<string, unknown>) => onChange(node.id, { content: { ...(node.content || {}), ...patch } });

  return (
    <aside className="pb-right">
      <div className="pb-insp-head">
        <div className="ttl">
          inspector · <span style={{ color: 'var(--teal-deep)' }}>{node.type}</span>
        </div>
        <div className="sub">{layerLabel(node, lang)}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="pb-pill" onClick={() => onDuplicate(node.id)}>⧉ {tr(lang, 'ทำซ้ำ', 'Duplicate')}</button>
          <button className="pb-pill" onClick={() => onBringToFront(node.id)} title={tr(lang, 'ขึ้นบนสุด', 'Bring to front')}>⏫</button>
          <button className="pb-pill" onClick={() => onBringForward(node.id)} title={tr(lang, 'เลื่อนขึ้น', 'Bring forward')}>↑</button>
          <button className="pb-pill" onClick={() => onSendBackward(node.id)} title={tr(lang, 'เลื่อนลง', 'Send backward')}>↓</button>
          <button className="pb-pill" onClick={() => onSendToBack(node.id)} title={tr(lang, 'ลงล่างสุด', 'Send to back')}>⏬</button>
          <button className={`pb-pill ${node.locked ? 'on' : ''}`} onClick={() => onToggleLock(node.id)} title={tr(lang, 'ล็อก/ปลดล็อก', 'Lock/Unlock')}>
            {node.locked ? '🔒' : '🔓'}
          </button>
          <button className="pb-pill" onClick={() => onDelete(node.id)} style={{ background: '#f4dad4', color: '#9a4a3f' }}>✕ {tr(lang, 'ลบ', 'Delete')}</button>
        </div>
      </div>
      <div className="pb-insp-body">
        <div className="pb-insp-group">
          <div className="lbl">{tr(lang, 'ตำแหน่งและขนาด', 'Position & size')}</div>
          <div className="pb-fld-row">
            <NumFld label="X" value={node.x} onChange={(v) => onChange(node.id, { x: v })} />
            <NumFld label="Y" value={node.y} onChange={(v) => onChange(node.id, { y: v })} />
          </div>
          <div className="pb-fld-row">
            <NumFld label="W" value={node.w} onChange={(v) => onChange(node.id, { w: Math.max(8, v) })} />
            <NumFld label="H" value={node.h} onChange={(v) => onChange(node.id, { h: Math.max(8, v) })} />
          </div>
          <div className="pb-fld-row">
            <NumFld label="z" value={node.z || 1} onChange={(v) => onChange(node.id, { z: v })} />
            <NumFld label="rot" value={node.rot || 0} onChange={(v) => onChange(node.id, { rot: v })} suffix="°" />
          </div>
          <SliderFld
            label={tr(lang, 'ความโปร่งใส', 'Opacity')}
            min={0}
            max={1}
            step={0.05}
            value={node.opacity != null ? node.opacity : 1}
            fmt={(v) => Math.round(v * 100) + '%'}
            onChange={(v) => onChange(node.id, { opacity: v })}
          />
        </div>

        {node.type === 'text' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'ตัวอักษร', 'Typography')}</div>
            <textarea className="pb-input" rows={3} value={node.content?.text || ''} onChange={(e) => setContent({ text: e.target.value })} />
            <div className="pb-pill-row">
              {['Mitr', 'IBM Plex Sans Thai', 'Archivo Black', 'Caveat', 'JetBrains Mono'].map((f) => (
                <button key={f} className={`pb-pill ${s.fontFamily === f ? 'on' : ''}`} style={{ fontFamily: f }} onClick={() => setStyle({ fontFamily: f })}>
                  {f.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="pb-fld-row three">
              <NumFld label="Sz" value={s.fontSize || 18} onChange={(v) => setStyle({ fontSize: v })} />
              <NumFld label="Wt" value={s.fontWeight || 400} step={100} onChange={(v) => setStyle({ fontWeight: v })} />
              <NumFld label="LH" value={s.lineHeight || 1.4} step={0.05} onChange={(v) => setStyle({ lineHeight: v })} />
            </div>
            <div className="pb-pill-row">
              {['left', 'center', 'right'].map((a) => (
                <button key={a} className={`pb-pill ${(s.align || 'left') === a ? 'on' : ''}`} onClick={() => setStyle({ align: a })}>
                  {a}
                </button>
              ))}
            </div>
            <div>
              <div className="lbl" style={{ fontSize: 10, marginBottom: 6 }}>{tr(lang, 'สีตัวอักษร', 'Color')}</div>
              <Swatches value={s.color} onPick={(c) => setStyle({ color: c })} />
            </div>
          </div>
        )}

        {node.type === 'image' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'รูปภาพ', 'Image')}</div>
            <ImageUploader
              folder="portfolio"
              // Freeform canvas → crop to the node's current box ratio.
              primary={{ ratio: node.w / node.h || 1, label: tr(lang, 'ครอบตัดตามกรอบ', 'Crop to box') }}
              value={(node.content?.src as string) || ''}
              meta={(node.content?.meta as ImageMeta | null) || null}
              onChange={({ url, meta }) => setContent({ src: url || undefined, meta })}
            />
          </div>
        )}

        {(node.type === 'shape' || node.type === 'image') && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'มาสก์ / รูปร่าง', 'Mask / shape')}</div>
            <div className="pb-pill-row">
              {Object.keys(SHAPES).map((k) => (
                <button key={k} className={`pb-pill ${node.content?.shape === k ? 'on' : ''}`} onClick={() => setContent({ shape: k })}>
                  {pick((SHAPES as Record<string, { th: string; en: string }>)[k], lang)}
                </button>
              ))}
            </div>
            {node.content?.shape === 'rect' && (
              <SliderFld label={tr(lang, 'มุมโค้ง', 'Corner radius')} min={0} max={120} step={1} value={s.radius || 0} onChange={(v) => setStyle({ radius: v })} />
            )}
            {node.type === 'shape' && (
              <>
                <div className="lbl" style={{ fontSize: 10 }}>{tr(lang, 'สีพื้น', 'Fill')}</div>
                <Swatches value={s.fill} onPick={(c) => setStyle({ fill: c })} />
              </>
            )}
          </div>
        )}

        {node.type === 'link' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'ลิงก์', 'Hyperlink')}</div>
            <input className="pb-input" placeholder={tr(lang, 'ข้อความปุ่ม', 'Label')} value={node.content?.text || ''} onChange={(e) => setContent({ text: e.target.value })} />
            <input className="pb-input" placeholder="https://…" value={node.link?.href || ''} onChange={(e) => setLink({ href: e.target.value })} />
            <div className="pb-pill-row">
              {['_self', '_blank'].map((t) => (
                <button key={t} className={`pb-pill ${(node.link?.target || '_self') === t ? 'on' : ''}`} onClick={() => setLink({ target: t })}>
                  {t === '_blank' ? tr(lang, 'แท็บใหม่', 'New tab') : tr(lang, 'แท็บเดิม', 'Same tab')}
                </button>
              ))}
            </div>
            <div className="lbl" style={{ fontSize: 10 }}>{tr(lang, 'สีพื้น', 'Fill')}</div>
            <Swatches value={s.fill} onPick={(c) => setStyle({ fill: c })} />
            <div className="lbl" style={{ fontSize: 10 }}>{tr(lang, 'สีตัวอักษร', 'Label color')}</div>
            <Swatches value={s.color} onPick={(c) => setStyle({ color: c })} />
          </div>
        )}

        {node.type === 'sticker' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'สติกเกอร์', 'Sticker')}</div>
            <div className="pb-sticker-grid">
              {STICKERS.map((st) => (
                <button
                  key={st.key}
                  className="pb-sticker"
                  style={{ outline: st.key === node.content?.key ? '2px solid var(--teal)' : '0' }}
                  onClick={() => setContent({ key: st.key })}
                  dangerouslySetInnerHTML={{ __html: st.svg }}
                />
              ))}
            </div>
          </div>
        )}

        {node.type === 'contact' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'ข้อมูลติดต่อ', 'Contact info')}</div>
            {profile && (
              <button
                className="pb-pill"
                style={{ marginBottom: 8 }}
                onClick={() => setContent({ name: profile.name, email: profile.email, phone: profile.phone })}
              >
                ↺ {tr(lang, 'ดึงจากโปรไฟล์', 'Fill from profile')}
              </button>
            )}
            <input className="pb-input" placeholder={tr(lang, 'ชื่อ', 'Name')} value={node.content?.name || ''} onChange={(e) => setContent({ name: e.target.value })} />
            <input className="pb-input" placeholder={tr(lang, 'อีเมล', 'Email')} value={node.content?.email || ''} onChange={(e) => setContent({ email: e.target.value })} />
            <input className="pb-input" placeholder={tr(lang, 'เบอร์โทร', 'Phone')} value={node.content?.phone || ''} onChange={(e) => setContent({ phone: e.target.value })} />
            <input className="pb-input" placeholder="LINE" value={node.content?.line || ''} onChange={(e) => setContent({ line: e.target.value })} />
            <input className="pb-input" placeholder="Instagram" value={node.content?.ig || ''} onChange={(e) => setContent({ ig: e.target.value })} />
          </div>
        )}

        {node.type === 'credential' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'เลือกกิจกรรมจริง', 'Pick a real journey')}</div>
            {credentials.length > 0 ? (
              <div className="pb-pill-row">
                {credentials.map((c) => (
                  <button
                    key={c.id}
                    className={`pb-pill ${node.content?.credId === c.id ? 'on' : ''}`}
                    onClick={() =>
                      setContent({
                        credId: c.id,
                        cred: {
                          th: c.title,
                          en: c.title,
                          date: fmtCredDate(c.date),
                          tone: c.attended ? 'teal' : 'cream',
                        },
                      })
                    }
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>
                  {tr(lang, 'ยังไม่มีกิจกรรมที่เข้าร่วม — ใช้ตัวอย่างไปก่อน', 'No journeys yet — using samples')}
                </p>
                <div className="pb-pill-row">
                  {SAMPLE_CREDENTIALS.map((c) => (
                    <button key={c.id} className={`pb-pill ${node.content?.credId === c.id ? 'on' : ''}`} onClick={() => setContent({ credId: c.id, cred: undefined })}>
                      {pick({ th: c.th, en: c.en }, lang)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {node.type === 'embed' && (
          <div className="pb-insp-group">
            <div className="lbl">{tr(lang, 'มีเดีย', 'Media embed')}</div>
            <div className="pb-pill-row">
              {['youtube', 'spotify', 'audio'].map((p) => (
                <button key={p} className={`pb-pill ${node.content?.provider === p ? 'on' : ''}`} onClick={() => setContent({ provider: p })}>
                  {p}
                </button>
              ))}
            </div>
            <input className="pb-input" placeholder="URL" value={node.content?.url || ''} onChange={(e) => setContent({ url: e.target.value })} />
          </div>
        )}

        <div className="pb-insp-group">
          <div className="lbl">{tr(lang, 'แอนิเมชัน', 'Animation')}</div>
          <div className="pb-pill-row">
            {ANIM_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`pb-pill ${(node.animation?.preset || 'none') === p.key ? 'on' : ''}`}
                onClick={() => setAnim({ preset: p.key === 'none' ? null : p.key })}
              >
                {pick(p, lang)}
              </button>
            ))}
          </div>
          {node.animation?.preset && (
            <div className="pb-fld-row">
              <NumFld label="Delay" value={node.animation?.delay || 0} step={50} onChange={(v) => setAnim({ delay: v })} suffix="ms" />
              <NumFld label="Dur" value={node.animation?.duration || 700} step={50} onChange={(v) => setAnim({ duration: v })} suffix="ms" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ── Zoom controls ── */
export function ZoomControls({ zoom, onZoom, onFit, lang }: { zoom: number; onZoom: (z: number) => void; onFit: () => void; lang: Lang }) {
  return (
    <div className="pb-zoom">
      <button onClick={() => onZoom(Math.max(ZOOM_MIN, zoom - 0.1))} title={tr(lang, 'ซูมออก', 'Zoom out')}>−</button>
      <span className="v">{Math.round(zoom * 100)}%</span>
      <button onClick={() => onZoom(Math.min(ZOOM_MAX, zoom + 0.1))} title={tr(lang, 'ซูมเข้า', 'Zoom in')}>+</button>
      <button onClick={onFit} style={{ fontSize: 11, padding: '0 8px', width: 'auto' }}>fit</button>
      <button onClick={() => onZoom(1)} style={{ fontSize: 11, padding: '0 8px', width: 'auto' }}>100</button>
    </div>
  );
}

/* ── Exit-preview bar ── */
export function ExitPreviewBar({ lang, onExit }: { lang: Lang; onExit: () => void }) {
  return (
    <button className="pb-exit-preview" onClick={onExit}>
      <span>←</span>
      <span>{tr(lang, 'กลับสู่หน้าแก้ไข', 'Back to editor')}</span>
      <span className="sep" />
      <Link href="/me/portfolio" onClick={(e) => e.stopPropagation()}>
        {tr(lang, 'Portfolio', 'Portfolio')}
      </Link>
    </button>
  );
}
