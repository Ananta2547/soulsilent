'use client';

import type { ReactNode } from 'react';

/* Small shared pieces of the Host Dashboard tabs. */

export const baht = (n: number) => '฿' + Math.round(n).toLocaleString('th-TH');
export const num = (n: number, d = 1) => n.toLocaleString('th-TH', { maximumFractionDigits: d });
export const FEW = 'ข้อมูลยังน้อย';
const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "2026-10-25" → "25 ต.ค." · with year → "25 ต.ค. 69" */
export const thDay = (d: string, year = false) =>
  `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}${year ? ` ${String(Number(d.slice(0, 4)) + 543).slice(2)}` : ''}`;
/** "2026-10" → "ต.ค. 69" */
export const thMonth = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1]} ${String(Number(ym.slice(0, 4)) + 543).slice(2)}`;
export const DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

/** Change against the previous window. `kind` decides how it reads:
 *  'pct' = relative change, 'pt' = percentage points, 'abs' = plain count. */
export function Delta({ cur, prev, kind }: { cur: number | null; prev: number | null; kind: 'pct' | 'pt' | 'abs' }) {
  if (cur == null || prev == null) return <span className="hd-delta flat">ไม่มีช่วงก่อนหน้าให้เทียบ</span>;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.05) return <span className="hd-delta flat">เท่าช่วงก่อน</span>;
  const up = diff > 0;
  const text =
    kind === 'pct'
      ? prev === 0
        ? 'ใหม่ในช่วงนี้'
        : `${num(Math.abs((diff / Math.abs(prev)) * 100), 0)}%`
      : kind === 'pt'
        ? `${num(Math.abs(diff), 1)} จุด`
        : num(Math.abs(diff), 0);
  return (
    <span className={`hd-delta ${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {text}
    </span>
  );
}

/** One of the figure cards: label, big value (or "ข้อมูลยังน้อย"), comparison. */
export function StatCard({ label, value, delta, onClick, title }: { label: string; value: string | null; delta?: ReactNode; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <span className="tdb-mono-label">{label}</span>
      <span className={`v${value == null ? ' few' : ''}`}>{value ?? FEW}</span>
      {delta}
    </>
  );
  return onClick ? (
    <button type="button" className="hd-card" onClick={onClick} title={title} style={{ cursor: 'pointer' }}>
      {body}
    </button>
  ) : (
    <div className="hd-card" title={title}>
      {body}
    </div>
  );
}

export function Panel({ title, sub, children, className, right }: { title: string; sub?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`hd-panel ${className || ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3>{title}</h3>
        {right}
      </div>
      {sub ? <p className="sub">{sub}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

/** Horizontal bars, in the caller's order. No pie charts. */
export function HBars({ rows, format = (v) => num(v, 0) }: { rows: { label: string; value: number; note?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="hd-few">ยังไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} className="hd-hbar">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>
            {r.label}
          </span>
          <span className="track" aria-hidden>
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span style={{ fontWeight: 600 }}>
            {format(r.value)}
            {r.note && <span className="hd-few"> · {r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A small "x%" with the "too few people" fallback. */
export const pctOrFew = (v: number | null | undefined) => (v == null ? FEW : `${num(v)}%`);

/** Stacked bars over time; each series is a colour. Hover shows the numbers. */
export function StackBars({
  labels,
  series,
  format = (v) => num(v, 0),
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  format?: (v: number) => string;
}) {
  const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const step = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div>
      {series.length > 1 && (
        <div className="hd-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="hd-stack">
        {labels.map((l, i) => (
          <div key={l} title={`${l}: ${series.map((s) => `${s.name} ${format(s.values[i] || 0)}`).join(' · ')}`} aria-label={`${l} ${format(totals[i])}`}>
            {series.map((s) => (
              <span key={s.name} style={{ height: `${(Math.max(0, s.values[i] || 0) / max) * 100}%`, background: s.color, minHeight: s.values[i] ? 2 : 0 }} />
            ))}
            {!totals[i] && <span style={{ height: 2, background: 'var(--cream-deep)' }} />}
          </div>
        ))}
      </div>
      <div className="hd-axis">
        {labels.map((l, i) => (
          <span key={l}>{i % step === 0 || i === labels.length - 1 ? l : ''}</span>
        ))}
      </div>
    </div>
  );
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
