'use client';

/* Canvas right-click menu. Rendered in a portal on <body> so it escapes the
 * canvas's transform/scale containing block, positioned at the cursor with
 * viewport-edge flipping. Closes on outside-click / Esc / scroll / blur. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr, type Lang } from '@/lib/i18n';
import type { PNode } from '@/lib/portfolio-builder';

export type CtxAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'forward'
  | 'front'
  | 'backward'
  | 'back'
  | 'lock';

type Row =
  | { kind: 'divider' }
  | {
      kind: 'item';
      action: CtxAction;
      icon: string;
      label: string;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
    };

export function ContextMenu({
  x,
  y,
  node,
  canPaste,
  lang,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  node: PNode | null;
  canPaste: boolean;
  lang: Lang;
  onAction: (a: CtxAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Flip away from viewport edges once measured.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (x + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // Dismiss triggers.
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // capture:true so an outside mousedown closes before other handlers run.
    window.addEventListener('mousedown', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const rows: Row[] = node
    ? [
        { kind: 'item', action: 'cut', icon: '✂️', label: tr(lang, 'ตัด', 'Cut'), shortcut: 'Ctrl+X' },
        { kind: 'item', action: 'copy', icon: '📋', label: tr(lang, 'คัดลอก', 'Copy'), shortcut: 'Ctrl+C' },
        { kind: 'item', action: 'paste', icon: '📄', label: tr(lang, 'วาง', 'Paste'), shortcut: 'Ctrl+V', disabled: !canPaste },
        { kind: 'item', action: 'delete', icon: '🗑️', label: tr(lang, 'ลบ', 'Delete'), shortcut: 'Del', danger: true },
        { kind: 'divider' },
        { kind: 'item', action: 'forward', icon: '🔼', label: tr(lang, 'เลื่อนขึ้น 1 ชั้น', 'Bring forward'), shortcut: 'Ctrl+]' },
        { kind: 'item', action: 'front', icon: '⏫', label: tr(lang, 'ขึ้นบนสุด', 'Bring to front') },
        { kind: 'item', action: 'backward', icon: '🔽', label: tr(lang, 'เลื่อนลง 1 ชั้น', 'Send backward'), shortcut: 'Ctrl+[' },
        { kind: 'item', action: 'back', icon: '⏬', label: tr(lang, 'ลงล่างสุด', 'Send to back') },
        { kind: 'divider' },
        {
          kind: 'item',
          action: 'lock',
          icon: node.locked ? '🔓' : '🔒',
          label: node.locked ? tr(lang, 'ปลดล็อก', 'Unlock') : tr(lang, 'ล็อก', 'Lock'),
        },
      ]
    : [
        { kind: 'item', action: 'paste', icon: '📄', label: tr(lang, 'วาง', 'Paste'), shortcut: 'Ctrl+V', disabled: !canPaste },
      ];

  return createPortal(
    <div
      ref={ref}
      className="pb-ctx"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {rows.map((row, i) =>
        row.kind === 'divider' ? (
          <div key={`d${i}`} className="pb-ctx-divider" />
        ) : (
          <button
            key={row.action}
            type="button"
            role="menuitem"
            className={`pb-ctx-item ${row.danger ? 'danger' : ''}`}
            disabled={row.disabled}
            onClick={() => {
              onAction(row.action);
              onClose();
            }}
          >
            <span className="ico" aria-hidden>{row.icon}</span>
            <span className="lbl">{row.label}</span>
            {row.shortcut && <span className="sc">{row.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
