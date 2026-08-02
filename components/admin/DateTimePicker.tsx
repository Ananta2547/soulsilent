'use client';

/* Clean date + time picker built on the browser's native <input type="date">
 * and <input type="time"> widgets (calendar popup + 24h time, per Thai locale).
 * Value is "YYYY-MM-DDTHH:MM" — same shape as datetime-local — so callers need
 * no other changes. `invalid` draws a red border for validation feedback. */
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
      <input
        type="time"
        aria-label="เวลา"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className={`${className}${ring} !w-auto`}
      />
    </div>
  );
}
