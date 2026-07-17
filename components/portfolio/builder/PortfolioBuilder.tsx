'use client';

/* Portfolio Builder — root (state, history, save). Ported from soulsilent-portfolio.jsx.
 * Persists the whole document to /api/me/portfolio (doc_json column).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import {
  CANVAS_W,
  CANVAS_H_MIN,
  TEMPLATES,
  defaultDoc,
  nid,
  type PNode,
  type PortfolioDoc,
} from '@/lib/portfolio-builder';
import { CanvasStage, ZOOM_MIN, ZOOM_MAX } from './CanvasEngine';
import { DesignTopBar, LeftPanel, Inspector, ZoomControls, ExitPreviewBar } from './BuilderUI';
import { ContextMenu, type CtxAction } from './ContextMenu';

/* ── history hook ──
 * `present` is real state (read during render); past/future are kept in a ref
 * and surfaced as boolean state so canUndo/canRedo update without reading the
 * ref during render.
 */
function useHistory(initial: PortfolioDoc, limit = 50) {
  const [present, setPresent] = useState<PortfolioDoc>(initial);
  const stacks = useRef({ past: [] as PortfolioDoc[], future: [] as PortfolioDoc[] });
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });
  const syncFlags = useCallback(() => {
    setFlags({ canUndo: stacks.current.past.length > 0, canRedo: stacks.current.future.length > 0 });
  }, []);

  const set = useCallback(
    (updater: PortfolioDoc | ((p: PortfolioDoc) => PortfolioDoc), opts: { replace?: boolean } = {}) => {
      setPresent((cur) => {
        const next = typeof updater === 'function' ? (updater as (p: PortfolioDoc) => PortfolioDoc)(cur) : updater;
        if (!opts.replace) {
          stacks.current.past.push(cur);
          if (stacks.current.past.length > limit) stacks.current.past.shift();
          stacks.current.future = [];
          syncFlags();
        }
        return next;
      });
    },
    [limit, syncFlags],
  );

  const undo = useCallback(() => {
    if (!stacks.current.past.length) return;
    setPresent((cur) => {
      stacks.current.future.unshift(cur);
      const prev = stacks.current.past.pop()!;
      syncFlags();
      return prev;
    });
  }, [syncFlags]);

  const redo = useCallback(() => {
    if (!stacks.current.future.length) return;
    setPresent((cur) => {
      stacks.current.past.push(cur);
      const nxt = stacks.current.future.shift()!;
      syncFlags();
      return nxt;
    });
  }, [syncFlags]);

  /* Snapshot the CURRENT state onto the undo stack without changing it. Used at
   * the start of a continuous gesture (drag/resize/rotate) so the whole gesture
   * collapses into a single undo step back to where it began. */
  const checkpoint = useCallback(() => {
    setPresent((cur) => {
      stacks.current.past.push(cur);
      if (stacks.current.past.length > limit) stacks.current.past.shift();
      stacks.current.future = [];
      syncFlags();
      return cur;
    });
  }, [limit, syncFlags]);

  return [present, set, undo, redo, flags.canUndo, flags.canRedo, checkpoint] as const;
}

/** Apply a partial patch to one node (deep-merging styles/content/link/animation). */
function applyPatch(p: PortfolioDoc, id: string, patch: Partial<PNode>): PortfolioDoc {
  return {
    ...p,
    nodes: p.nodes.map((n) => {
      if (n.id !== id) return n;
      const merged: PNode = { ...n, ...patch };
      if (patch.styles) merged.styles = { ...(n.styles || {}), ...patch.styles };
      if (patch.content) merged.content = { ...(n.content || {}), ...patch.content };
      if (patch.link) merged.link = { ...(n.link || {}), ...patch.link };
      if (patch.animation !== undefined) {
        merged.animation = patch.animation === null ? null : { ...(n.animation || {}), ...patch.animation };
      }
      return merged;
    }),
  };
}

export function PortfolioBuilder() {
  const { lang } = useLang();
  const [loaded, setLoaded] = useState(false);
  const [initialDoc, setInitialDoc] = useState<PortfolioDoc | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  // Load from API once, then mount the builder with that doc as history seed.
  useEffect(() => {
    (async () => {
      let doc: PortfolioDoc | null = null;
      try {
        const res = await fetch('/api/me/portfolio');
        const data = (await res.json()) as { portfolio?: { id?: string; doc_json?: string | null; published?: number } };
        if (data.portfolio?.id) setPortfolioId(data.portfolio.id);
        if (data.portfolio?.doc_json) {
          doc = JSON.parse(data.portfolio.doc_json) as PortfolioDoc;
          if (data.portfolio.published) doc.visibility = 'public';
        }
      } catch {}
      setInitialDoc(doc || defaultDoc('participant'));
      setLoaded(true);
    })();
  }, []);

  if (!loaded || !initialDoc) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#dcd3c0' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <BuilderInner key={initialDoc.id} initialDoc={initialDoc} lang={lang} portfolioId={portfolioId} />;
}

function BuilderInner({ initialDoc, lang, portfolioId }: { initialDoc: PortfolioDoc; lang: 'th' | 'en'; portfolioId: string | null }) {
  const [pf, setPf, undo, redo, canUndo, canRedo, checkpoint] = useHistory(initialDoc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [mode, setMode] = useState<'design' | 'preview'>('design');

  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [zen, setZen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [toast, setToast] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const [credentials, setCredentials] = useState<{ id: string; title: string; date: string; attended: number }[]>([]);
  const [profile, setProfile] = useState<{ name?: string; email?: string; phone?: string } | null>(null);

  // Pull the owner's real workshops + profile so credential/contact nodes use
  // genuine data instead of the hardcoded samples.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/me/credentials');
        const d = (await r.json()) as { credentials?: { id: string; title: string; date: string; attended: number }[] };
        setCredentials(d.credentials || []);
      } catch {}
      try {
        const r = await fetch('/api/auth/me');
        const d = (await r.json()) as { user?: { name?: string; email?: string; phone?: string } };
        setProfile(d.user || null);
      } catch {}
    })();
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gridStyle = 'dot';
  const motionOn = true;

  const notify = useCallback((m: string) => {
    setToast(m);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const topZ = useCallback(() => Math.max(0, ...pf.nodes.map((n) => n.z || 0)), [pf.nodes]);

  /* node ops */
  // Discrete edit → pushes one undo step (inspector fields, arrow nudge, etc.).
  const onChange = useCallback(
    (id: string, patch: Partial<PNode>) => setPf((p) => applyPatch(p, id, patch)),
    [setPf],
  );
  // Live edit during a gesture → replaces present WITHOUT pushing history, so a
  // whole drag/resize/rotate collapses into the single checkpoint taken at its
  // start (see onInteractionStart). Undo then jumps straight back to point A.
  const onChangeLive = useCallback(
    (id: string, patch: Partial<PNode>) => setPf((p) => applyPatch(p, id, patch), { replace: true }),
    [setPf],
  );
  const onInteractionStart = useCallback(() => checkpoint(), [checkpoint]);

  const addFromPreset = useCallback(
    (preset: Record<string, unknown>, kind: PNode['type']) => {
      const z = topZ() + 1;
      const p = preset as { w: number; h: number; content?: object; styles?: object; link?: object; animation?: object };
      const newNode: PNode = {
        id: nid(),
        type: kind,
        x: 60 + Math.round(Math.random() * 80),
        y: 60 + Math.round(Math.random() * 80),
        w: p.w,
        h: p.h,
        z,
        content: { ...(p.content || {}) },
        styles: { ...(p.styles || {}) },
        link: p.link ? { ...p.link } : undefined,
        animation: p.animation ? { ...p.animation } : undefined,
      };
      setPf((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));
      setSelectedId(newNode.id);
    },
    [topZ, setPf],
  );

  const addPalette = useCallback(
    (it: { preset: Record<string, unknown>; kind: string }) => {
      // Prefill a new contact card from the user's profile.
      if (it.kind === 'contact' && profile) {
        const presetContent = (it.preset.content as Record<string, unknown>) || {};
        const preset = {
          ...it.preset,
          content: { ...presetContent, name: profile.name, email: profile.email, phone: profile.phone },
        };
        addFromPreset(preset, 'contact');
        return;
      }
      addFromPreset(it.preset, it.kind as PNode['type']);
    },
    [addFromPreset, profile],
  );

  const addSticker = useCallback(
    (key: string) => {
      const z = topZ() + 1;
      const node: PNode = { id: nid(), type: 'sticker', x: 160, y: 160, w: 140, h: 140, z, content: { key } };
      setPf((p) => ({ ...p, nodes: [...p.nodes, node] }));
      setSelectedId(node.id);
    },
    [topZ, setPf],
  );

  const uploadSticker = useCallback(
    (file: File) => {
      // Upload the original file to R2 (preserves transparent PNG / SVG) and
      // store the URL — never a base64 string in the document.
      (async () => {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const key = `images/portfolio/sticker_${crypto.randomUUID()}.${ext}`;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('key', key);
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd });
          const data = (await res.json()) as { url?: string; error?: string };
          if (!res.ok || !data.url) {
            notify(data.error || tr(lang, 'อัปโหลดไม่สำเร็จ', 'Upload failed'));
            return;
          }
          const z = topZ() + 1;
          const node: PNode = { id: nid(), type: 'sticker', x: 160, y: 160, w: 160, h: 160, z, content: { key: 'user:' + nid(), userSrc: data.url } };
          setPf((p) => ({ ...p, nodes: [...p.nodes, node] }));
          setSelectedId(node.id);
          notify(tr(lang, 'เพิ่มสติกเกอร์แล้ว', 'Sticker added'));
        } catch {
          notify(tr(lang, 'อัปโหลดไม่สำเร็จ', 'Upload failed'));
        }
      })();
    },
    [topZ, setPf, notify, lang],
  );

  const onCommitText = useCallback(
    (id: string, text: string) => {
      if (text === '__edit__') {
        setEditingTextId(id);
        return;
      }
      setEditingTextId(null);
      setPf((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, content: { ...(n.content || {}), text } } : n)) }));
    },
    [setPf],
  );

  const onDelete = useCallback(
    (id: string) => {
      setPf((p) => ({ ...p, nodes: p.nodes.filter((n) => n.id !== id) }));
      setSelectedId(null);
    },
    [setPf],
  );

  const onDuplicate = useCallback(
    (id: string) => {
      const orig = pf.nodes.find((n) => n.id === id);
      if (!orig) return;
      const copy: PNode = { ...orig, id: nid(), x: orig.x + 24, y: orig.y + 24, z: topZ() + 1 };
      setPf((p) => ({ ...p, nodes: [...p.nodes, copy] }));
      setSelectedId(copy.id);
    },
    [pf.nodes, topZ, setPf],
  );

  /* Unified stacking — moves the node within a dense (gap-free) z order and
   * reassigns every node's z to its new index, so reorder/front/back never
   * collide or leave ties. */
  const moveZ = useCallback(
    (id: string, where: 'forward' | 'backward' | 'front' | 'back') => {
      setPf((p) => {
        const sorted = [...p.nodes].sort((a, b) => (a.z || 0) - (b.z || 0)); // bottom → top
        const i = sorted.findIndex((n) => n.id === id);
        if (i < 0) return p;
        const arr = [...sorted];
        const [item] = arr.splice(i, 1);
        const j =
          where === 'forward' ? Math.min(arr.length, i + 1)
          : where === 'backward' ? Math.max(0, i - 1)
          : where === 'front' ? arr.length
          : 0;
        arr.splice(j, 0, item);
        const zmap = new Map(arr.map((n, idx) => [n.id, idx]));
        return { ...p, nodes: p.nodes.map((n) => ({ ...n, z: zmap.get(n.id) ?? n.z })) };
      });
    },
    [setPf],
  );
  const onBringForward = useCallback((id: string) => moveZ(id, 'forward'), [moveZ]);
  const onSendBackward = useCallback((id: string) => moveZ(id, 'backward'), [moveZ]);
  const onBringToFront = useCallback((id: string) => moveZ(id, 'front'), [moveZ]);
  const onSendToBack = useCallback((id: string) => moveZ(id, 'back'), [moveZ]);

  /* Reorder from the Layers panel. `idsTopToBottom` is the visible (z-desc)
   * order; we reverse to bottom→top and assign dense z = index. */
  const onReorderLayers = useCallback(
    (idsTopToBottom: string[]) => {
      setPf((p) => {
        const bottomToTop = [...idsTopToBottom].reverse();
        const zmap = new Map(bottomToTop.map((id, idx) => [id, idx]));
        return { ...p, nodes: p.nodes.map((n) => ({ ...n, z: zmap.has(n.id) ? (zmap.get(n.id) as number) : n.z })) };
      });
    },
    [setPf],
  );

  const onToggleLock = useCallback(
    (id: string) => {
      setPf((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, locked: !n.locked } : n)) }));
    },
    [setPf],
  );

  /* In-app clipboard (a cloned node held in a ref). */
  const clipboard = useRef<PNode | null>(null);
  const [hasClip, setHasClip] = useState(false);
  const onCopy = useCallback(
    (id: string) => {
      const n = pf.nodes.find((x) => x.id === id);
      if (!n) return;
      clipboard.current = JSON.parse(JSON.stringify(n)) as PNode;
      setHasClip(true);
    },
    [pf.nodes],
  );
  const onPaste = useCallback(() => {
    const c = clipboard.current;
    if (!c) return;
    const copy: PNode = { ...(JSON.parse(JSON.stringify(c)) as PNode), id: nid(), x: c.x + 24, y: c.y + 24, z: topZ() + 1, locked: false };
    setPf((p) => ({ ...p, nodes: [...p.nodes, copy] }));
    setSelectedId(copy.id);
  }, [topZ, setPf]);
  const onCut = useCallback(
    (id: string) => {
      onCopy(id);
      onDelete(id);
    },
    [onCopy, onDelete],
  );

  /* Right-click context menu (cursor position + target node). */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const openContextMenu = useCallback((e: React.MouseEvent, nodeId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (nodeId) setSelectedId(nodeId);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, []);

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).matches?.('input,textarea,[contenteditable="true"]');
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        onDuplicate(selectedId);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedId) {
        e.preventDefault();
        onCopy(selectedId);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && selectedId) {
        e.preventDefault();
        onCut(selectedId);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        onPaste();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.key === '[') && selectedId) {
        e.preventDefault();
        moveZ(selectedId, e.key === ']' ? 'forward' : 'backward');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        onDelete(selectedId);
        return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingTextId(null);
        setMode('design');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setZen((v) => !v);
        return;
      }
      if (selectedId && !e.metaKey && !e.ctrlKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const n = pf.nodes.find((x) => x.id === selectedId);
        if (n) onChange(selectedId, { x: n.x + dx, y: n.y + dy });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, pf.nodes, undo, redo, onDelete, onDuplicate, onChange, onCopy, onCut, onPaste, moveZ]);

  const onFitToScreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = Math.min(0.95, Math.min(el.clientWidth / (CANVAS_W + 120), el.clientHeight / ((pf.canvasH || CANVAS_H_MIN) + 100)));
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit)));
    setPan({ x: 0, y: 0 });
  }, [pf.canvasH]);

  /* save */
  const persist = useCallback(
    async (doc: PortfolioDoc, published: boolean) => {
      try {
        await fetch('/api/me/portfolio', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc, published }),
        });
      } catch {}
    },
    [],
  );

  const onSave = useCallback(async () => {
    setSaveState('saving');
    await persist(pf, pf.visibility === 'public');
    setSaveState('saved');
    notify(tr(lang, 'บันทึกแล้ว ✓', 'Saved ✓'));
  }, [pf, persist, notify, lang]);

  const onToggleVisibility = useCallback(() => {
    const next = pf.visibility === 'public' ? 'private' : 'public';
    const doc = { ...pf, visibility: next as 'public' | 'private' };
    setPf(doc, { replace: true });
    persist(doc, next === 'public');
    notify(next === 'public' ? tr(lang, 'เผยแพร่สาธารณะแล้ว', 'Now public') : tr(lang, 'ตั้งเป็นส่วนตัวแล้ว', 'Now private'));
  }, [pf, setPf, persist, notify, lang]);

  const onCopyURL = useCallback(() => {
    if (!portfolioId) {
      notify(tr(lang, 'บันทึกก่อนเพื่อรับลิงก์', 'Save first to get a link'));
      return;
    }
    try {
      navigator.clipboard?.writeText(`${location.origin}/p/${portfolioId}`);
    } catch {}
    notify(tr(lang, 'คัดลอกลิงก์แล้ว', 'Link copied'));
  }, [portfolioId, notify, lang]);

  /* Debounced autosave — persists ~1.2s after the last edit. */
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState('unsaved');
    const t = setTimeout(async () => {
      setSaveState('saving');
      await persist(pf, pf.visibility === 'public');
      setSaveState('saved');
    }, 1200);
    return () => clearTimeout(t);
  }, [pf, persist]);

  // Guard tab-close / in-app nav while a save is pending or in flight.
  const warnMsg = tr(
    lang,
    'การเปลี่ยนแปลงยังบันทึกไม่เสร็จ — ออกจากหน้านี้หรือไม่?',
    'Changes are still saving — leave this page?',
  );
  useUnsavedGuard(saveState !== 'saved', warnMsg);

  const selectedNode = useMemo(() => pf.nodes.find((n) => n.id === selectedId) || null, [pf.nodes, selectedId]);
  const isPreview = mode === 'preview';

  return (
    <div className={`pb-app ${isPreview ? 'preview' : ''} ${zen ? 'zen' : ''}`}>
      {!isPreview ? (
        <DesignTopBar
          lang={lang}
          pf={pf}
          setMode={(m) => setMode(m as 'design' | 'preview')}
          showLeft={showLeft}
          setShowLeft={setShowLeft}
          showRight={showRight}
          setShowRight={setShowRight}
          zen={zen}
          setZen={setZen}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onSave={onSave}
          onCopyURL={onCopyURL}
          onToggleVisibility={onToggleVisibility}
          shareId={portfolioId}
          saveState={saveState}
        />
      ) : (
        // No fake site chrome in preview — just a floating device toggle so the
        // preview shows exactly what the published page looks like.
        <div className="pb-preview-device">
          <div className="pb-device-toggle" title={tr(lang, 'อุปกรณ์', 'Device')}>
            <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>◻ Desktop</button>
            <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>▯ Mobile</button>
          </div>
        </div>
      )}

      <div className="pb-body">
        {!isPreview && (
          <LeftPanel
            open={showLeft}
            nodes={pf.nodes}
            selectedId={selectedId}
            lang={lang}
            onAdd={addPalette}
            onAddSticker={addSticker}
            onUploadSticker={uploadSticker}
            onReorderLayers={onReorderLayers}
            onToggleLock={onToggleLock}
            onSelect={(id) => {
              setSelectedId(id);
              setEditingTextId(null);
            }}
          />
        )}

        <CanvasStage
          stageRef={stageRef}
          nodes={pf.nodes}
          selectedId={selectedId}
          editingTextId={editingTextId}
          preview={isPreview}
          gridStyle={gridStyle}
          motionOn={motionOn}
          canvasH={pf.canvasH || CANVAS_H_MIN}
          canvasBg={pf.canvasBg || 'paper'}
          lang={lang}
          device={device}
          zoom={zoom}
          pan={pan}
          spaceDown={spaceDown}
          panning={panning}
          onZoomChange={setZoom}
          onPanChange={setPan}
          onSpaceChange={setSpaceDown}
          onPanningChange={setPanning}
          onSelect={(id) => {
            setSelectedId(id);
            setEditingTextId(null);
          }}
          onChangeLive={onChangeLive}
          onInteractionStart={onInteractionStart}
          onCommitText={onCommitText}
          onContextMenu={openContextMenu}
        />

        {!isPreview && (
          <Inspector
            open={showRight}
            node={selectedNode}
            lang={lang}
            onChange={onChange}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onBringForward={onBringForward}
            onSendBackward={onSendBackward}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onToggleLock={onToggleLock}
            credentials={credentials}
            profile={profile}
          />
        )}

        {!isPreview && (
          <>
            <ZoomControls zoom={zoom} onZoom={setZoom} onFit={onFitToScreen} lang={lang} />
            <div className="pb-hint-bar">
              <kbd>Space</kbd>+drag pan <span>·</span>
              <kbd>Ctrl</kbd>+wheel zoom <span>·</span>
              <kbd>Tab</kbd> zen
            </div>
          </>
        )}
      </div>

      {isPreview && <ExitPreviewBar lang={lang} onExit={() => setMode('design')} />}

      {toast && (
        <div className="toast">
          <svg width="16" height="16" fill="none" stroke="#fff" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {ctxMenu && !isPreview && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          node={ctxMenu.nodeId ? pf.nodes.find((n) => n.id === ctxMenu.nodeId) || null : null}
          canPaste={hasClip}
          lang={lang}
          onClose={() => setCtxMenu(null)}
          onAction={(a: CtxAction) => {
            const id = ctxMenu.nodeId;
            if (a === 'paste') return onPaste();
            if (!id) return;
            if (a === 'cut') onCut(id);
            else if (a === 'copy') onCopy(id);
            else if (a === 'delete') onDelete(id);
            else if (a === 'forward') moveZ(id, 'forward');
            else if (a === 'front') moveZ(id, 'front');
            else if (a === 'backward') moveZ(id, 'backward');
            else if (a === 'back') moveZ(id, 'back');
            else if (a === 'lock') onToggleLock(id);
          }}
        />
      )}

      {/* Template picker (replaces tweaks panel) when canvas is empty/seeding */}
      {!isPreview && pf.nodes.length === 0 && (
        <TemplatePicker
          lang={lang}
          onPick={(tplKey) => {
            const t = (TEMPLATES as Record<string, { build: () => PNode[]; canvasH: number }>)[tplKey];
            if (!t) return;
            setPf((p) => ({ ...p, template: tplKey, canvasH: t.canvasH, nodes: t.build() }));
          }}
        />
      )}
    </div>
  );
}

function TemplatePicker({ lang, onPick }: { lang: 'th' | 'en'; onPick: (k: string) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        background: 'var(--paper)',
        borderRadius: 18,
        padding: 24,
        boxShadow: '0 24px 60px -18px rgba(13,30,29,.4)',
        zIndex: 30,
        textAlign: 'center',
      }}
    >
      <p className="display-th" style={{ fontSize: 20, margin: '0 0 4px' }}>
        {tr(lang, 'เลือกเทมเพลตเริ่มต้น', 'Choose a starting template')}
      </p>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
        {tr(lang, 'หรือเริ่มจากแคนวาสเปล่า', 'or start from an empty canvas')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Object.entries(TEMPLATES).map(([k, t]) => (
          <button key={k} className="pb-pill" onClick={() => onPick(k)} style={{ padding: '10px 16px' }}>
            {tr(lang, (t as { th: string }).th, (t as { en: string }).en)}
          </button>
        ))}
      </div>
    </div>
  );
}
