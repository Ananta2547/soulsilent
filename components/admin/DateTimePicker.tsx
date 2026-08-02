'use client';

/* Clean date + time picker: native <input type="date"> calendar popup for the
 * date, TimeField24 (24h hour/minute dropdowns) for the time. Value is
 * "YYYY-MM-DDTHH:MM" — same shape as datetime-local — so callers need no other
 * changes. `invalid` draws a red border for validation feedback. */
import { TimeField24 } from './TimeField24';

export function DateTimePicker({
  value,
  onChange,
  invalid = false,
  className = 'input-field',
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  className?: string;
}) {
  // "YYYY-MM-DDTHH:MM" → ["YYYY-MM-DD", "HH:MM"]
  const [date = '', time = ''] = (value || '').split('T');

  // Keep the value empty until a date is chosen (a lone time is meaningless).
  const setDate = (d: string) => onChange(d ? `${d}T${time || '00:00'}` : '');
  const setTime = (t: string) => onChange(date ? `${date}T${t}` : '');

  const ring = invalid ? ' !border-red-500 ring-1 ring-red-400 focus:!ring-red-400' : '';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        aria-label="วันที่"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={`${className}${ring} !w-auto`}
      />
      <TimeField24 value={time || '00:00'} onChange={setTime} className={`${className}${ring}`} />
    </div>
  );
}
