'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminHead, AdminChips, Badge } from '@/components/admin/AdminShell';

/** Admin console for trying the finance export by hand: pick a type and a
 *  date range, paste the export key, and see exactly what the accounting app
 *  will get back. The key is held in sessionStorage only, so closing the tab
 *  forgets it. Same-origin call, so no CORS is needed. */

const TYPES = [
  { v: 'summary', label: 'summary — รายเดือน' },
  { v: 'bookings', label: 'bookings — รายการจอง' },
  { v: 'workshops', label: 'journeys — สรุปต่อรอบ' },
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
  // Read the saved key on first render (the page only renders on the client,
  // behind AdminGuard). Kept in sessionStorage so closing the tab forgets it.
  const [key, setKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(KEY_STORE) || '';
    } catch {
      return '';
    }
  });
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
    <>
      <AdminHead
        eyebrow="admin · export"
        title="ทดสอบ Export API"
        sub="ยิง /api/export/finance ของเซิร์ฟเวอร์นี้ด้วย key เดียวกับที่ทีมบัญชีจะใช้ — ผลที่เห็นคือสิ่งที่แอปภายนอกจะได้รับเป๊ะ ๆ"
      />

      <section className="adm-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="adm-field">
          <label htmlFor="fx-key">x-export-key</label>
          <input
            id="fx-key"
            type="password"
            className="adm-mono"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            placeholder="วาง FINANCE_EXPORT_KEY"
            autoComplete="off"
          />
          <p className="adm-hint">key เก็บไว้เฉพาะแท็บนี้ ปิดแท็บแล้วหาย</p>
        </div>
        <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="adm-field">
            <label htmlFor="fx-type">type</label>
            <select id="fx-type" value={type} onChange={(e) => { setType(e.target.value as typeof type); setCursor(''); }}>
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label htmlFor="fx-from">from {type === 'workshops' ? '(วันจัด)' : '(วันจอง)'}</label>
            <input id="fx-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="adm-field">
            <label htmlFor="fx-to">to</label>
            <input id="fx-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {type === 'bookings' && (
            <div className="adm-field">
              <label htmlFor="fx-limit">limit (1–2000)</label>
              <input id="fx-limit" type="number" min={1} max={2000} value={limit} onChange={(e) => { setLimit(e.target.value); setCursor(''); }} />
            </div>
          )}
          <div className="adm-field">
            <label htmlFor="fx-fmt">format</label>
            <select id="fx-fmt" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="json">json</option>
              <option value="csv">csv</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button className="adm-btn teal" disabled={busy || !key} onClick={() => { setCursor(''); setTimeout(run, 0); }}>
            {busy ? 'กำลังดึง…' : 'ยิง API'}
          </button>
          <button className="adm-btn" onClick={() => navigator.clipboard?.writeText(curl)}>
            คัดลอก curl
          </button>
          {type === 'bookings' && res?.json?.next_cursor && (
            <button className="adm-btn" disabled={busy} onClick={nextPage}>
              หน้าถัดไป →
            </button>
          )}
          {cursor && <span className="adm-meta adm-mono" style={{ marginLeft: 'auto', fontSize: 11.5 }}>cursor: {cursor.slice(0, 18)}…</span>}
        </div>
        <div className="adm-code">{curl}</div>
      </section>

      {res && (
        <section className="adm-card">
          <div className="adm-fx-status">
            <Badge tone={res.status === 200 ? 'ok' : 'bad'}>HTTP {res.status || 'ERR'}</Badge>
            <span className="adm-meta" style={{ fontSize: 13.5 }}>
              {res.ms} ms · {(res.body.length / 1024).toFixed(1)} KB{res.json?.count != null ? ` · ${res.json.count} แถว` : ''}
            </span>
            {res.json?.totals && (
              <span className="adm-mono" style={{ fontSize: 12 }}>
                {Object.entries(res.json.totals).map(([k, v]) => `${k}=${cell(v)}`).join(' · ')}
              </span>
            )}
            {res.json?.rows && (
              <div style={{ marginLeft: 'auto' }}>
                <AdminChips
                  value={view}
                  onChange={setView}
                  items={[
                    { key: 'table', label: 'ตาราง' },
                    { key: 'raw', label: 'JSON' },
                  ]}
                />
              </div>
            )}
          </div>

          {res.json?.rows && view === 'table' ? (
            rows.length === 0 ? (
              <p className="adm-empty">ไม่มีแถวในช่วงนี้</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table adm-mono" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c} style={{ whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', padding: '8px 16px' }} title={cell(r[c])}>
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
            <pre className="adm-pre">{res.json ? JSON.stringify(res.json, null, 2) : res.body}</pre>
          )}
        </section>
      )}

      <p className="adm-meta" style={{ margin: 0 }}>
        คู่มือ field ทั้งหมดอยู่ที่ <code>docs/finance-api.md</code> ใน repo
      </p>
    </>
  );
}
