'use client';

/* 24-hour time picker (hour + minute dropdowns). Guaranteed military/ISO time
 * regardless of browser/OS locale — never shows AM/PM. Value is "HH:MM". */
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

export function TimeField24({
  value,
  onChange,
  className = 'input-field',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [rawH = '00', rawM = '00'] = (value || '00:00').split(':');
  const h = pad(Number(rawH) || 0);
  const m = pad(Number(rawM) || 0);

  return (
    <div className="flex items-center gap-2">
      <select aria-label="ชั่วโมง" className={`${className} !w-auto`} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-gray font-medium">:</span>
      <select aria-label="นาที" className={`${className} !w-auto`} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray">น.</span>
    </div>
  );
}
