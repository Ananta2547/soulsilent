'use client';

/**
 * A small yes/no popup for the host pages (closing the wizard with unsaved
 * changes, sending an activity again without edits). It sits above the
 * wizard (z-index 200) and uses the host dashboard's modal look.
 */
import { useEffect, type ReactNode } from 'react';

export type ConfirmAction = { label: string; tone?: 'ink' | 'teal' | 'soft' | 'danger'; onClick: () => void; disabled?: boolean };

export function HostConfirm({ title, children, actions, onClose }: { title: string; children?: ReactNode; actions: ConfirmAction[]; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [onClose]);

  const tone = (t: ConfirmAction['tone']) =>
    t === 'ink'
      ? { background: 'var(--ink)', color: '#fff' }
      : t === 'teal'
        ? { background: 'var(--teal)', color: '#fff' }
        : t === 'danger'
          ? { background: '#fde4e1', color: '#a3261a' }
          : { background: 'var(--cream)', color: 'var(--ink)' };

  return (
    <div className="tdb-backdrop center" style={{ zIndex: 200 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="tdb-modal" role="alertdialog" aria-modal="true" aria-label={title} style={{ maxWidth: 460, padding: '26px 26px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 500, fontSize: 21, lineHeight: 1.3, margin: 0 }}>{title}</h2>
        {children && <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>{children}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 8 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              style={{ height: 44, padding: '0 18px', borderRadius: 999, fontSize: 14, fontWeight: 600, border: 0, cursor: 'pointer', ...tone(a.tone) }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
