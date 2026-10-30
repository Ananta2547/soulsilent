'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* Shared pieces of the Host Dashboard v3 tabs (styles: ./dash.css, hx-*) — used by the Host Dashboard and Admin Insights. */

export const baht = (n: number) => (Math.round(n) < 0 ? '−฿' : '฿') + Math.abs(Math.round(n)).toLocaleString('th-TH');
export const num = (n: number, d = 1) => n.toLocaleString('th-TH', { maximumFractionDigits: d });
export const FEW = 'ข้อมูลยังน้อย';
const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "2026-10-25" → "25 ต.ค." · with year → "25 ต.ค. 69" */
export const thDay = (d: string, year = false) =>
  d ? `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}${year ? ` ${String(Number(d.slice(0, 4)) + 543).slice(2)}` : ''}` : '';
/** "2026-10" → "ต.ค. 69" */
export const thMonth = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1]} ${String(Number(ym.slice(0, 4)) + 543).slice(2)}`;
export const DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
export const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
export const pctOrFew = (v: number | null | undefined) => (v == null ? FEW : `${num(v)}%`);
export const PAL = ['#0d8a7e', '#f5c243', '#075a51', '#a5d9d1', '#c86b5a', '#6a7a78'];

export type Tone = 'up' | 'dn' | 'ne';
export type DeltaInfo = { text: string; tone: Tone };

/** Change against the previous window: 'pct' relative, 'pt' points, 'abs' a count. */
export function deltaOf(cur: number | null, prev: number | null, kind: 'pct' | 'pt' | 'abs'): DeltaInfo {
  if (cur == null || prev == null) return { text: 'ไม่มีช่วงก่อนหน้าให้เทียบ', tone: 'ne' };
  const diff = cur - prev;
  if (Math.abs(diff) < 0.05) return { text: 'เท่าช่วงก่อน', tone: 'ne' };
  const text =
    kind === 'pct' ? (prev === 0 ? 'ใหม่ในช่วงนี้' : `${num(Math.abs((diff / Math.abs(prev)) * 100), 0)}%`) : kind === 'pt' ? `${num(Math.abs(diff), 1)} จุด` : num(Math.abs(diff), 0);
  return { text: `${diff > 0 ? '▲' : '▼'} ${text}`, tone: diff > 0 ? 'up' : 'dn' };
}

/* ---------- icons (24px grid, 1.8 stroke) ---------- */
const S = (d: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
    {d}
  </svg>
);
export const I = {
  grid: (s?: number) => S(<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>, s),
  cal: (s?: number) => S(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>, s),
  chev: (s = 14) => S(<path d="M6 9l6 6 6-6" />, s),
  check: (s?: number) => S(<path d="M5 12.5l4.5 4.5L19 7.5" />, s),
  down: (s?: number) => S(<path d="M12 4v11M7 10.5l5 4.5 5-4.5M5 19.5h14" />, s),
  plus: (s = 14) => S(<path d="M12 5v14M5 12h14" />, s),
  copy: (s = 14) => S(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>, s),
  qr: (s = 15) => S(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2" /></>, s),
  power: (s = 15) => S(<path d="M12 4v8M7 6.5a7 7 0 1010 0" />, s),
  close: (s?: number) => S(<path d="M6 6l12 12M18 6L6 18" />, s),
  spark: (s = 20) => S(<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />, s),
  ext: (s = 14) => S(<path d="M14 5h5v5M19 5l-8 8M18 14v4a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18V7.5A1.5 1.5 0 015.5 6H10" />, s),
};

/* ---------- containers ---------- */

export function Card({ title, sub, right, className = '', delay = 0, children, style }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string; delay?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className={`hx-card ${className}`} style={{ animationDelay: `${delay}ms`, ...style }}>
      {title != null && (
        <div className="hx-card-h">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="hx-empty">{children}</div>;

export type Kpi = { label: string; value: string | null; delta?: DeltaInfo | string; onClick?: () => void; title?: string };
/** The figure tiles: label, big value (or "ข้อมูลยังน้อย"), a comparison chip. */
export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="hx-kpis">
      {items.map((c, i) => {
        const d = typeof c.delta === 'string' ? { text: c.delta, tone: 'ne' as Tone } : c.delta;
        return (
          <button key={c.label} type="button" className={`hx-kpi${c.onClick ? ' click' : ''}`} onClick={c.onClick} title={c.title} style={{ animationDelay: `${i * 60}ms` }} tabIndex={c.onClick ? 0 : -1}>
            <span className="hx-label">{c.label}</span>
            {c.value == null ? <span className="few">{FEW}</span> : <span className="val">{c.value}</span>}
            {d && <span className={`hx-delta ${d.tone}`}>{d.text}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- charts ---------- */

/** Stacked bars over time; hover shows the numbers. `every` = axis label step. */
export function Bars({ labels, series, fmt = (v) => num(v, 0), every }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; fmt?: (v: number) => string; every?: number }) {
  const tot = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
  const max = Math.max(1, ...tot);
  const step = every || Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div>
      {series.length > 1 && (
        <div className="hx-legend" style={{ marginBottom: 10 }}>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="hx-bars">
        {labels.map((l, i) => (
          <div key={`${l}-${i}`} title={`${l}: ${series.map((s) => `${s.name} ${fmt(s.values[i] || 0)}`).join(' · ')}`} style={{ animationDelay: `${150 + i * 40}ms` }}>
            {series
              .filter((s) => (s.values[i] || 0) > 0)
              .map((s) => (
                <span key={s.name} style={{ height: `${(s.values[i] / max) * 100}%`, background: s.color }} />
              ))}
            {!tot[i] && <span className="empty" />}
          </div>
        ))}
      </div>
      <div className="hx-axis">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`}>{i % step === 0 || i === labels.length - 1 ? l : ''}</span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars, in the caller's order. */
export function HBars({ rows, fmt = (v) => num(v, 0), noneText = 'ยังไม่มีข้อมูลในช่วงนี้' }: { rows: { label: string; value: number; note?: string }[]; fmt?: (v: number) => string; noneText?: string }) {
  if (!rows.length) return <Empty>{noneText}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hx-hb">
      {rows.map((r, i) => (
        <div key={r.label} className="hx-hb-row">
          <div className="hx-hb-top">
            <span>{r.label}</span>
            <b>
              {fmt(r.value)}
              {r.note && <small> · {r.note}</small>}
            </b>
          </div>
          <span className="hx-track">
            <span style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${200 + i * 80}ms` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** One bar split 100% + a legend row per part. */
export function Stack100({ items, noneText }: { items: { label: string; value: number; color: string }[]; noneText: string }) {
  const t = items.reduce((s, x) => s + x.value, 0);
  return (
    <>
      {t ? (
        <div className="hx-s100">
          {items
            .filter((x) => x.value)
            .map((x) => (
              <span key={x.label} style={{ width: `${(x.value / t) * 100}%`, background: x.color }} />
            ))}
        </div>
      ) : (
        <Empty>{noneText}</Empty>
      )}
      <div className="hx-s100-items">
        {items.map((x) => (
          <div key={x.label} className="hx-s100-item">
            <i style={{ background: x.color }} />
            <span className="tx">{x.label}</span>
            <b>{num(x.value, 0)}</b>
            <span className="pc">{t ? `${num((x.value / t) * 100, 0)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export type Row = { main: ReactNode; sub?: ReactNode; amt?: ReactNode; mono?: boolean; faded?: boolean; key?: string; /** data-focus tokens (AlertFocus) */ focus?: string };
export function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="hx-rows">
      {rows.map((x, i) => (
        <div key={x.key || i} className="hx-row" data-focus={x.focus} style={x.faded ? { opacity: 0.5 } : undefined}>
          <div className="main">
            <div>{x.main}</div>
            {x.sub && <div className={`sub${x.mono ? ' mono' : ''}`}>{x.sub}</div>}
          </div>
          {x.amt != null && <span className="amt">{x.amt}</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------- controls ---------- */

export function Seg<K extends string>({ options, value, onChange }: { options: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="hx-seg" role="group">
      {options.map(([k, l]) => (
        <button key={k} type="button" className={k === value ? 'on' : ''} aria-pressed={k === value} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export type Opt = { key: string; label: string; icon?: ReactNode };
/** A pill button that opens a small menu. `onOpen` lets the parent lift its
 *  stacking order while the menu is out (cards animate, so each is its own layer). */
export function Dropdown({
  label,
  icon,
  options,
  value,
  onPick,
  small,
  onOpen,
  extra,
  ariaLabel,
  keepOpenOn,
}: {
  label: string;
  icon?: ReactNode;
  options: Opt[];
  value?: string;
  onPick: (k: string) => void;
  small?: boolean;
  onOpen?: (open: boolean) => void;
  /** Rendered under the options (e.g. custom date inputs). */
  extra?: ReactNode;
  ariaLabel?: string;
  /** Picking this key leaves the menu open (e.g. "custom" to show dates). */
  keepOpenOn?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = (v: boolean) => {
    setOpen(v);
    onOpen?.(v);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        onOpen?.(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onOpen]);
  return (
    <div className={`hx-dd${open ? ' open' : ''}`}>
      <button type="button" className={`hx-dd-btn${small ? ' sm' : ''}`} aria-expanded={open} aria-label={ariaLabel} onClick={() => set(!open)}>
        {icon && <span className="ic">{icon}</span>}
        <span className="tx">{label}</span>
        <span className="cv">{I.chev()}</span>
      </button>
      {open && (
        <>
          <div className="hx-dd-scrim" onClick={() => set(false)} />
          <div className="hx-dd-pop" role="menu">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="menuitem"
                className={`hx-dd-opt${o.key === value ? ' on' : ''}`}
                onClick={() => {
                  onPick(o.key);
                  if (o.key !== keepOpenOn) set(false);
                }}
              >
                {o.icon && <span className="ic">{o.icon}</span>}
                <span className="tx">{o.label}</span>
                {o.key === value && <span className="ck">{I.check()}</span>}
              </button>
            ))}
            {extra}
          </div>
        </>
      )}
    </div>
  );
}

/** Right-hand sheet on a computer, bottom sheet on a phone. Rendered at the
 *  dashboard root so the sticky tabs cannot sit on top of it; only opened
 *  after a click, so the root is always there. */
export function Sheet({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <>
      <div className="hx-scrim" onClick={onClose} />
      <aside className="hx-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hx-sheet-h">
          <h3>{title}</h3>
          <button type="button" className="hx-btn icon" onClick={onClose} aria-label="ปิด">
            {I.close()}
          </button>
        </div>
        <div className="hx-sheet-b">{children}</div>
        <div className="hx-sheet-f">{footer}</div>
      </aside>
    </>,
    document.querySelector('.hx') || document.body,
  );
}

/** A short confirmation that fades by itself. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1900);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="hx-toast" role="status">
      <span>{I.check(15)}</span>
      {msg}
    </div>
  ) : null;
  return [node, setMsg] as const;
}

/** Download rows as a CSV file (Excel-friendly UTF-8). */
export function downloadCsv(name: string, head: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
