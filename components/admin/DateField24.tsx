'use client';

/* Date picker with Day / Month / Year dropdowns, displayed strictly in
 * DD/MM/YYYY order regardless of browser/OS locale (native <input type="date">
 * follows the OS locale, which is often MM/DD/YYYY). Value is "YYYY-MM-DD",
 * same as a native date input, so callers need no other changes.
 *
 * Keeps its own partial state so the three dropdowns can be filled one at a
 * time — the committed `value` only updates once all three are chosen. */
import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

/** Days in a given month/year; 31 when month/year not yet chosen. */
function daysInMonth(y: string, m: string): number {
  if (!y || !m) return 31;
  return new Date(Number(y), Number(m), 0).getDate();
}

export function DateField24({
  value,
  onChange,
  className = 'input-field',
  yearsAhead = 4,
  yearsBehind = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  yearsAhead?: number;
  yearsBehind?: number;
}) {
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');

  // Hydrate from a committed value (edit mode / external set). We only sync when
  // `value` is a real date — an empty `value` is left alone so a half-finished
  // selection isn't wiped between the day/month/year clicks.
  useEffect(() => {
    if (value) {
      const [vy = '', vm = '', vd = ''] = value.split('-');
      setY(vy);
      setM(vm);
      setD(vd);
    }
  }, [value]);

  const now = new Date();
  const base = now.getFullYear();
  const yearSet = new Set<number>();
  for (let i = -yearsBehind; i <= yearsAhead; i++) yearSet.add(base + i);
  if (y) yearSet.add(Number(y)); // keep an out-of-range stored year selectable
  const YEARS = [...yearSet].sort((a, b) => a - b);
  const MONTHS = Array.from({ length: 12 }, (_, i) => pad(i + 1));
  const DAYS = Array.from({ length: daysInMonth(y, m) }, (_, i) => pad(i + 1));

  function update(ny: string, nm: string, nd: string) {
    // Clamp the day to the (new) month/year length.
    if (ny && nm && nd) {
      const max = daysInMonth(ny, nm);
      if (Number(nd) > max) nd = pad(max);
    }
    setY(ny);
    setM(nm);
    setD(nd);
    onChange(ny && nm && nd ? `${ny}-${nm}-${nd}` : '');
  }

  const sel = `${className} !w-auto`;
  return (
    <div className="flex items-center gap-2">
      <select aria-label="วัน" className={sel} value={d} onChange={(e) => update(y, m, e.target.value)}>
        <option value="">วว</option>
        {DAYS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="text-gray font-medium">/</span>
      <select aria-label="เดือน" className={sel} value={m} onChange={(e) => update(y, e.target.value, d)}>
        <option value="">ดด</option>
        {MONTHS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="text-gray font-medium">/</span>
      <select aria-label="ปี" className={sel} value={y} onChange={(e) => update(e.target.value, m, d)}>
        <option value="">ปปปป</option>
        {YEARS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
    </div>
  );
}
