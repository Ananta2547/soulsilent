'use client';

import { useEffect, useMemo, useState } from 'react';

/** Admin console for trying the finance export by hand: pick a type and a
 *  date range, paste the export key, and see exactly what the accounting app
 *  will get back. The key is held in sessionStorage only, so closing the tab
 *  forgets it. Same-origin call, so no CORS is needed. */

const TYPES = [
  { v: 'summary', label: 'summary — รายเดือน' },
  { v: 'bookings', label: 'bookings — รายการจอง' },
  { v: 'workshops', label: 'workshops — สรุปต่อรอบ' },
  { v: 'orphans', label: 'orphans — เงินเข้าผิดปกติ' },
] as const;

type Row = Record<string, unknown>;
type Result = { status: number; ms: number; body: string; json: { rows?: Row[]; next_cursor?: string | null; totals?: Row; count?: number } | null };

const KEY_STORE = 'finance-export-key';

function cell(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(' | ');
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}

export default function FinanceExportTester() {
  const [key, setKey] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['v']>('summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('50');
  const [cursor, setCursor] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [view, setView] = useState<'table' | 'raw'>('table');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    try {
      setKey(sessionStorage.getItem(KEY_STORE) || '');
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    try {
      if (key) sessionStorage.setItem(KEY_STORE, key);
      else sessionStorage.removeItem(KEY_STORE);
    } catch {
      /* private mode */
    }
  }, [key]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ type });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (type === 'bookings') {
      if (limit) q.set('limit', limit);
      if (cursor) q.set('cursor', cursor);
    }
    if (format === 'csv') q.set('format', 'csv');
    return `/api/export/finance?${q.toString()}`;
  }, [type, from, to, limit, cursor, format]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const curl = `curl.exe -H "x-export-key: <KEY>" "${origin}${query}"`;

  async function run() {
    setBusy(true);
    const t0 = performance.now();
    try {
      const r = await fetch(query, { headers: { 'x-export-key': key } });
      const body = await r.text();
      let json: Result['json'] = null;
      try {
        json = JSON.parse(body);
      } catch {
        /* csv or error text */
      }
      setRes({ status: r.status, ms: Math.round(performance.now() - t0), body, json });
    } catch (e) {
      setRes({ status: 0, ms: Math.round(performance.now() - t0), body: String(e), json: null });
    } finally {
      setBusy(false);
    }
  }

  function nextPage() {
    if (res?.json?.next_cursor) {
      setCursor(res.json.next_cursor);
      setTimeout(run, 0);
    }
  }

  const rows = res?.json?.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">ทดสอบ Finance Export API</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
        ยิง <code>/api/export/finance</code> ของเซิร์ฟเวอร์นี้ด้วย key เดียวกับที่ทีมบัญชีจะใช้ — ผลที่เห็นคือสิ่งที่แอปภายนอกจะได้รับเป๊ะ ๆ
        key เก็บไว้เฉพาะแท็บนี้ ปิดแท็บแล้วหาย
      </p>

      <div className="rounded-xl border p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label className="text-sm" style={{ gridColumn: '1 / -1' }}>
          <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>x-export-key</span>
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            placeholder="วาง FINANCE_EXPORT_KEY"
            autoComplete="off"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>type</span>
          <select className="w-full rounded-lg border px-3 py-2" value={type} onChange={(e) => { setType(e.target.value as typeof type); setCursor(''); }}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>from {type === 'workshops' ? '(วันจัด)' : '(วันจอง)'}</span>
          <input type="date" className="w-full rounded-lg border px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>to</span>
          <input type="date" className="w-full rounded-lg border px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {type === 'bookings' && (
          <label className="text-sm">
            <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>limit (1–2000)</span>
            <input type="number" min={1} max={2000} className="w-full rounded-lg border px-3 py-2" value={limit} onChange={(e) => { setLimit(e.target.value); setCursor(''); }} />
          </label>
        )}
        <label className="text-sm">
          <span className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>format</span>
          <select className="w-full rounded-lg border px-3 py-2" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="json">json</option>
            <option value="csv">csv</option>
          </select>
        </label>
        <div className="flex items-end gap-2" style={{ gridColumn: '1 / -1' }}>
          <button className="btn btn-teal" disabled={busy || !key} onClick={() => { setCursor(''); setTimeout(run, 0); }}>
            {busy ? 'กำลังดึง…' : 'ยิง API'}
          </button>
          {type === 'bookings' && res?.json?.next_cursor && (
            <button className="btn btn-paper" disabled={busy} onClick={nextPage}>หน้าถัดไป →</button>
          )}
          <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
            {cursor ? `cursor: ${cursor.slice(0, 18)}…` : ''}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border px-3 py-2 text-xs font-mono flex items-center gap-2" style={{ background: 'var(--cream)' }}>
        <span className="truncate flex-1">{curl}</span>
        <button className="btn btn-paper btn-sm" onClick={() => navigator.clipboard?.writeText(curl)}>copy</button>
      </div>

      {res && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
              style={res.status === 200 ? { background: '#e5f5ef', color: '#1f6a4f' } : { background: '#fdecec', color: '#a13030' }}
            >
              HTTP {res.status || 'ERR'}
            </span>
            <span style={{ color: 'var(--muted)' }}>{res.ms} ms · {(res.body.length / 1024).toFixed(1)} KB</span>
            {res.json?.count != null && <span>{res.json.count} แถว</span>}
            {res.json?.totals && (
              <span className="font-mono text-xs">
                totals: {Object.entries(res.json.totals).map(([k, v]) => `${k}=${cell(v)}`).join('  ')}
              </span>
            )}
            {res.json?.rows && (
              <div className="ml-auto inline-flex rounded-full border p-0.5 text-xs">
                <button className={`px-3 py-1 rounded-full ${view === 'table' ? 'font-semibold' : ''}`} style={view === 'table' ? { background: 'var(--cream)' } : undefined} onClick={() => setView('table')}>ตาราง</button>
                <button className={`px-3 py-1 rounded-full ${view === 'raw' ? 'font-semibold' : ''}`} style={view === 'raw' ? { background: 'var(--cream)' } : undefined} onClick={() => setView('raw')}>JSON</button>
              </div>
            )}
          </div>

          {res.json?.rows && view === 'table' ? (
            rows.length === 0 ? (
              <div className="rounded-xl border p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>ไม่มีแถวในช่วงนี้</div>
            ) : (
              <div className="rounded-xl border overflow-x-auto">
                <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--cream)' }}>
                      {cols.map((c) => <th key={c} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        {cols.map((c) => (
                          <td key={c} className="px-3 py-1.5 whitespace-nowrap font-mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={cell(r[c])}>
                            {cell(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <pre className="rounded-xl border p-4 text-xs overflow-auto" style={{ maxHeight: 560, background: 'var(--cream)' }}>
              {res.json ? JSON.stringify(res.json, null, 2) : res.body}
            </pre>
          )}
        </div>
      )}

      <p className="text-xs mt-6" style={{ color: 'var(--muted)' }}>
        คู่มือ field ทั้งหมดอยู่ที่ <code>docs/finance-api.md</code> ใน repo
      </p>
    </div>
  );
}
