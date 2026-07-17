'use client';

/* Date + 24-hour time picker. Replaces native <input type="datetime-local">,
 * whose portions follow the OS locale (MM/DD/YYYY + AM/PM). The date uses
 * DateField24 (DD/MM/YYYY dropdowns) and the time uses TimeField24 (24h
 * hour/minute dropdowns). Value is "YYYY-MM-DDTHH:MM" — same shape as
 * datetime-local — so callers need no other changes. */
import { TimeField24 } from './TimeField24';
import { DateField24 } from './DateField24';

export function DateTimeField24({
  value,
  onChange,
  className = 'input-field',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  // "YYYY-MM-DDTHH:MM" → ["YYYY-MM-DD", "HH:MM"]
  const [date = '', time = ''] = (value || '').split('T');

  function setDate(d: string) {
    onChange(d ? `${d}T${time || '00:00'}` : '');
  }
  function setTime(t: string) {
    // Keep an empty value empty until a date is chosen.
    onChange(date ? `${date}T${t}` : '');
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateField24 value={date} onChange={setDate} className={className} />
      <TimeField24 value={time || '00:00'} onChange={setTime} className={className} />
    </div>
  );
}
