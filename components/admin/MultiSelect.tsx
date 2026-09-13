'use client';

/* A dropdown you tick several things in. The closed button reads what is
 * chosen; open, it lists every option with a checkbox. Admin-side only. */

import { useEffect, useRef, useState } from 'react';

export type MultiSelectOption = { value: string; label: string; hint?: string };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '— เลือก —',
  summary,
  className = '',
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Text on the closed button when something is chosen; default lists the labels. */
  summary?: (chosen: MultiSelectOption[]) => string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const chosen = options.filter((o) => value.includes(o.value));
  const label = chosen.length === 0 ? placeholder : summary ? summary(chosen) : chosen.map((o) => o.label).join(', ');

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input-field flex items-center justify-between gap-2 text-left w-full"
      >
        <span className={`truncate ${chosen.length === 0 ? 'text-gray' : 'text-dark'}`}>{label}</span>
        <span className="text-gray text-xs shrink-0">{chosen.length > 0 ? `${chosen.length} · ` : ''}{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable className="absolute z-30 mt-1 w-full min-w-[220px] max-h-64 overflow-auto rounded-lg border border-gray-lighter bg-white shadow-lg py-1">
          {options.length === 0 && <div className="px-3 py-2 text-xs text-gray">ไม่มีตัวเลือก</div>}
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <label key={o.value} role="option" aria-selected={on} className="flex items-start gap-2 px-3 py-2 text-sm text-dark hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-xs text-gray">{o.hint}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
