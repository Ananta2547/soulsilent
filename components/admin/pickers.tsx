'use client';

/**
 * Admin popups from "Admin Dashboard v3": the dropdown (AdmSelect) and the
 * date / time picker (PickDate, PickTime, PickDateTime). On a desktop each
 * opens as a card anchored under its field; on a phone it rises as a sheet
 * from the bottom. Styles live in app/admin/admin.css (adm-pop-*, adm-dp-*).
 *
 * AdmSelect is a drop-in for <select>: it reads its <option> children and
 * calls onChange with `{ target: { value } }`, so `onChange={(e) => …
 * e.target.value}` keeps working unchanged.
 */
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const pad = (n: number) => String(n).padStart(2, '0');
const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/* ------------------------------------------------------------------ */
/* Anchored popover / phone sheet                                      */
/* ------------------------------------------------------------------ */

type Anchor = { top: number; left: number; width: number; sheet: boolean; up: boolean };

function anchorOf(el: HTMLElement, width: number, height: number): Anchor {
  const r = el.getBoundingClientRect();
  const sheet = window.matchMedia('(max-width: 759px)').matches;
  const up = r.bottom + 8 + height > window.innerHeight && r.top - 8 - height > 0;
  return {
    sheet,
    up,
    width,
    top: up ? window.innerHeight - r.top + 8 : r.bottom + 8,
    left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left)),
  };
}

function Popover({
  anchor,
  onClose,
  role,
  label,
  children,
}: {
  anchor: Anchor;
  onClose: () => void;
  role: 'dialog' | 'listbox';
  label?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Rendered at the console root: a field inside a modal sheet sits under a
  // transformed ancestor, which would make position:fixed relative to it.
  return createPortal(
    <>
      <div className={`adm-pop-scrim${anchor.sheet ? ' is-sheet' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        role={role}
        aria-label={label}
        className={`adm-pop${anchor.sheet ? ' is-sheet' : ''}`}
        style={anchor.sheet ? undefined : { left: anchor.left, width: anchor.width, ...(anchor.up ? { bottom: anchor.top } : { top: anchor.top }) }}
      >
        {anchor.sheet && <div className="adm-pop-grip" aria-hidden="true" />}
        {children}
      </div>
    </>,
    document.querySelector('.adm') ?? document.body,
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" className="adm-field-chev" style={{ transform: open ? 'rotate(180deg)' : undefined }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 9l6 6 6-6" />
  </svg>
);

const CalIcon = () => (
  <svg width="18" height="18" className="adm-field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg width="18" height="18" className="adm-field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" strokeWidth={1.7} />
    <path strokeLinecap="round" strokeWidth={1.7} d="M12 7.5V12l3 2" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* AdmSelect                                                           */
/* ------------------------------------------------------------------ */

type Opt = { value: string; label: ReactNode; disabled: boolean };

/** Flatten <option> children (arrays and fragments included). */
function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
      if (el.type === Fragment || el.type === 'optgroup') {
        walk(el.props.children);
        return;
      }
      if (el.type === 'option') {
        const v = el.props.value ?? (typeof el.props.children === 'string' ? el.props.children : '');
        out.push({ value: String(v), label: el.props.children, disabled: !!el.props.disabled });
      }
    });
  };
  walk(children);
  return out;
}

export function AdmSelect({
  value,
  onChange,
  children,
  id,
  className,
  disabled,
  style,
  'aria-label': ariaLabel,
  title,
}: {
  value: string | number | undefined;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  'aria-label'?: string;
  title?: string;
  required?: boolean;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const opts = readOptions(children);
  const cur = String(value ?? '');
  const chosen = opts.find((o) => o.value === cur);
  const isPlaceholder = !chosen || chosen.value === '';
  // A coloured pill (the article share level in the list) keeps its own look.
  const pill = !!className?.includes('art-vis');

  return (
    <>
      <button
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        className={
          pill
            ? className
            : `adm-select${anchor ? ' is-open' : ''}${className?.includes('adm-mono') ? ' adm-mono' : ''}`
        }
        style={style}
        onClick={(e) => setAnchor(anchorOf(e.currentTarget, Math.max(220, e.currentTarget.offsetWidth), Math.min(340, opts.length * 44 + 16)))}
      >
        {pill ? (
          chosen?.label
        ) : (
          <>
            <span className={`adm-select-label${isPlaceholder ? ' is-ph' : ''}`}>{chosen ? chosen.label : '—'}</span>
            <Chevron open={!!anchor} />
          </>
        )}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} role="listbox" label={ariaLabel}>
          <div className="adm-pop-list">
            {opts.map((o, i) => (
              <button
                key={`${o.value}-${i}`}
                type="button"
                role="option"
                aria-selected={o.value === cur}
                disabled={o.disabled}
                className={`adm-pop-opt${o.value === cur ? ' is-on' : ''}`}
                onClick={() => {
                  setAnchor(null);
                  if (o.value !== cur) onChange({ target: { value: o.value } });
                }}
              >
                <span>{o.label}</span>
                <b aria-hidden="true">{o.value === cur ? '✓' : ''}</b>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Date / time picker                                                  */
/* ------------------------------------------------------------------ */

const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function todayIso(): string {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth(), n.getDate());
}

/** "2026-12-20" → "20 ธ.ค. 2569". */
export function fmtThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${TH_MON[m - 1]} ${y + 543}`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate());
}

function PickerPanel({
  mode,
  date,
  time,
  onPick,
  onCancel,
}: {
  mode: 'date' | 'time' | 'datetime';
  date: string;
  time: string;
  onPick: (date: string, time: string) => void;
  onCancel: () => void;
}) {
  const [today] = useState(todayIso);
  const [view, setView] = useState(() => {
    const [y, m] = (date || today).split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [d, setD] = useState(date);
  const [t, setT] = useState(time || '09:00');
  const [h, mi] = t.split(':');

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n: number) =>
    setView((v) => {
      const t2 = new Date(v.y, v.m + n, 1);
      return { y: t2.getFullYear(), m: t2.getMonth() };
    });
  const choose = (iso: string) => {
    if (mode === 'date') {
      onPick(iso, t);
      return;
    }
    setD(iso);
    const [y, m] = iso.split('-').map(Number);
    setView({ y, m: m - 1 });
  };
  const hasDate = mode !== 'time';
  const hasTime = mode !== 'date';

  return (
    <div className="adm-dp">
      {hasDate && (
        <>
          <div className="adm-dp-head">
            <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อน">
              ‹
            </button>
            <b>
              {TH_MONTH[view.m]} {view.y + 543}
            </b>
            <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป">
              ›
            </button>
          </div>
          <div className="adm-dp-wd" aria-hidden="true">
            {TH_WD.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="adm-dp-grid">
            {cells.map((c, i) => {
              if (c == null) return <span key={`e${i}`} />;
              const iso = isoOf(view.y, view.m, c);
              const on = iso === d;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`adm-dp-day${on ? ' is-on' : ''}${iso === today ? ' is-today' : ''}`}
                  aria-pressed={on}
                  aria-label={fmtThaiDate(iso)}
                  onClick={() => choose(iso)}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="adm-dp-quick">
            {(
              [
                ['วันนี้', today],
                ['พรุ่งนี้', addDays(today, 1)],
                ['อีก 7 วัน', addDays(today, 7)],
              ] as const
            ).map(([label, iso]) => (
              <button key={label} type="button" onClick={() => choose(iso)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {hasTime && (
        <>
          <div className={`adm-dp-time${hasDate ? ' has-line' : ''}`}>
            <div className="adm-label">ชั่วโมง</div>
            <div className="adm-dp-hours">
              {Array.from({ length: 24 }, (_, i) => pad(i)).map((x) => (
                <button key={x} type="button" className={x === h ? 'is-on' : ''} aria-pressed={x === h} onClick={() => setT(`${x}:${mi}`)}>
                  {x}
                </button>
              ))}
            </div>
            <div className="adm-label" style={{ marginTop: 4 }}>
              นาที
            </div>
            <div className="adm-dp-mins">
              {Array.from({ length: 12 }, (_, i) => pad(i * 5)).map((x) => (
                <button key={x} type="button" className={x === mi ? 'is-on' : ''} aria-pressed={x === mi} onClick={() => setT(`${h}:${x}`)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          <div className="adm-dp-foot">
            <span>
              {hasDate ? (d ? `${fmtThaiDate(d)} · ` : 'ยังไม่เลือกวัน · ') : ''}
              {t} น.
            </span>
            <button type="button" className="adm-btn sm" onClick={onCancel}>
              ยกเลิก
            </button>
            <button type="button" className="adm-btn sm teal" disabled={hasDate && !d} onClick={() => onPick(d, t)}>
              ตกลง
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Host Create Journey v4" panel: calendar with วันนี้ ‹ ›, past days  */
/* greyed, scroll-wheel hours/minutes, common times, summary footer.   */
/* ------------------------------------------------------------------ */

const ROW = 52;
const QUICK_TIMES = ['08:00', '09:00', '10:00', '13:00', '14:00', '17:00', '18:00', '19:00'];
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINS = Array.from({ length: 12 }, (_, i) => pad(i * 5));

function WheelCol({ label, items, value, onChange }: { label: string; items: string[]; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromWheel = useRef(false);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(0, items.indexOf(value));

  // Follow the chosen value when it changes from outside (a common-time
  // chip, or the first open), but not when the user's own scroll set it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fromWheel.current) {
      fromWheel.current = false;
      return;
    }
    el.scrollTo({ top: idx * ROW, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [idx]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (items[i] !== value) {
        fromWheel.current = true;
        onChange(items[i]);
      }
    }, 90);
  };

  const mask = 'linear-gradient(180deg, transparent 0, #000 34%, #000 66%, transparent 100%)';
  return (
    <div style={{ position: 'relative', width: 84, height: ROW * 3 }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, borderRadius: 14, background: 'var(--cream)', pointerEvents: 'none' }} />
      <div
        ref={ref}
        onScroll={onScroll}
        role="listbox"
        aria-label={label}
        style={{ position: 'relative', height: ROW * 3, overflowY: 'auto', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', overscrollBehavior: 'contain', WebkitMaskImage: mask, maskImage: mask }}
      >
        <div style={{ height: ROW }} />
        {items.map((v, i) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' })}
              style={{ display: 'block', width: '100%', height: ROW, scrollSnapAlign: 'center', fontFamily: "'Archivo Black', Mitr, sans-serif", fontSize: on ? 30 : 22, lineHeight: `${ROW}px`, color: on ? 'var(--ink)' : 'rgba(13,30,29,.35)', transition: 'font-size .15s, color .15s', textAlign: 'center' }}
            >
              {v}
            </button>
          );
        })}
        <div style={{ height: ROW }} />
      </div>
    </div>
  );
}

function WheelPanel({
  mode,
  date,
  time,
  onPick,
  onCancel,
  disablePast,
  taken,
}: {
  mode: 'date' | 'time' | 'datetime';
  date: string;
  time: string;
  onPick: (date: string, time: string) => void;
  onCancel: () => void;
  disablePast?: boolean;
  taken?: string[];
}) {
  const [today] = useState(todayIso);
  const [view, setView] = useState(() => {
    const [y, m] = (date || today).split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [d, setD] = useState(date);
  const [t, setT] = useState(() => {
    const [h0 = '09', m0 = '00'] = (time || '09:00').split(':');
    return `${h0}:${pad(Math.min(55, Math.round(Number(m0) / 5) * 5))}`;
  });
  const [h, mi] = t.split(':');

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n: number) =>
    setView((v) => {
      const t2 = new Date(v.y, v.m + n, 1);
      return { y: t2.getFullYear(), m: t2.getMonth() };
    });
  const hasDate = mode !== 'time';
  const hasTime = mode !== 'date';
  const needDate = hasDate && !d;
  const summary =
    mode === 'time' ? `${t} น.` : mode === 'date' ? (d ? fmtThaiDate(d) : 'แตะเลือกวันในปฏิทิน') : d ? `${fmtThaiDate(d)} · ${t} น.` : 'แตะเลือกวันด้านบนก่อน';
  const circle = { width: 34, height: 34, borderRadius: '50%', background: 'var(--cream)', fontSize: 17 } as const;

  return (
    <div className="adm-dp" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, paddingBottom: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'thin' }}>
        {hasDate && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <b style={{ flex: 1, fontFamily: 'Mitr, sans-serif', fontWeight: 500, fontSize: 17 }}>
                {TH_MONTH[view.m]} {view.y + 543}
              </b>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = today.split('-').map(Number);
                  setView({ y, m: m - 1 });
                }}
                style={{ height: 34, padding: '0 14px', borderRadius: 999, background: 'var(--cream)', fontSize: 12.5, fontWeight: 600 }}
              >
                วันนี้
              </button>
              <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อน" style={circle}>
                ‹
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป" style={circle}>
                ›
              </button>
            </div>
            <div className="adm-dp-wd" aria-hidden="true">
              {TH_WD.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="adm-dp-grid">
              {cells.map((c, i) => {
                if (c == null) return <span key={`e${i}`} />;
                const iso = isoOf(view.y, view.m, c);
                const on = iso === d;
                const off = !!disablePast && iso < today;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={off}
                    className={`adm-dp-day${on ? ' is-on' : ''}${iso === today ? ' is-today' : ''}`}
                    aria-pressed={on}
                    aria-label={fmtThaiDate(iso)}
                    onClick={() => setD(iso)}
                    style={off ? { opacity: 0.35, cursor: 'default' } : !on && taken?.includes(iso) ? { background: 'var(--teal-50)', color: 'var(--teal-deep)' } : undefined}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {hasTime && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, ...(hasDate ? { borderTop: '1px solid #eef0ef', paddingTop: 12 } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <WheelCol label="ชั่วโมง" items={HOURS} value={h} onChange={(v) => setT(`${v}:${mi}`)} />
              <span style={{ fontFamily: "'Archivo Black', Mitr, sans-serif", fontSize: 28, color: 'var(--muted)' }}>:</span>
              <WheelCol label="นาที" items={MINS} value={mi} onChange={(v) => setT(`${h}:${v}`)} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>น.</span>
            </div>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: -6 }}>เลื่อนขึ้น–ลง หรือหมุนลูกกลิ้งเมาส์</p>
            {mode === 'time' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="adm-label">เวลาที่ใช้บ่อย</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {QUICK_TIMES.map((v) => {
                    const on = v === t;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setT(v)}
                        style={{ height: 38, borderRadius: 12, fontFamily: 'var(--font-mono)', fontSize: 13, background: on ? 'var(--teal)' : 'var(--cream)', color: on ? '#fff' : 'var(--ink)', fontWeight: on ? 700 : 500 }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="adm-dp-foot" style={{ flexShrink: 0, padding: '10px 0', borderTop: '1px solid #eef0ef', background: '#fff' }}>
        <span style={needDate ? { color: '#a04a14' } : undefined}>{summary}</span>
        <button type="button" className="adm-btn sm" onClick={onCancel}>
          ยกเลิก
        </button>
        <button type="button" className="adm-btn sm teal" disabled={needDate} onClick={() => onPick(d, t)}>
          ตกลง
        </button>
      </div>
    </div>
  );
}

function PickField({
  mode,
  value,
  onChange,
  invalid,
  clearable = true,
  placeholder,
  ariaLabel,
  wheel,
  disablePast,
  taken,
}: {
  mode: 'date' | 'time' | 'datetime';
  value: string;
  onChange: (v: string) => void;
  wheel?: boolean;
  disablePast?: boolean;
  taken?: string[];
  invalid?: boolean;
  clearable?: boolean;
  placeholder: string;
  ariaLabel: string;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [date = '', time = ''] = mode === 'time' ? ['', value] : (value || '').split('T');
  const label =
    mode === 'time'
      ? value
        ? `${value} น.`
        : ''
      : mode === 'date'
        ? fmtThaiDate(value || '')
        : date
          ? `${fmtThaiDate(date)} · ${time || '00:00'} น.`
          : '';

  return (
    <div className={`adm-pick is-${mode}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        className={`adm-select adm-pick-btn${anchor ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}
        onClick={(e) => setAnchor(anchorOf(e.currentTarget, 320, wheel ? (mode === 'datetime' ? 640 : 420) : mode === 'time' ? 300 : mode === 'date' ? 380 : 620))}
      >
        {mode === 'time' ? <ClockIcon /> : <CalIcon />}
        <span className={`adm-select-label${label ? '' : ' is-ph'}`}>{label || placeholder}</span>
      </button>
      {clearable && label && (
        <button type="button" className="adm-pick-clear" onClick={() => onChange('')} aria-label="ล้าง">
          ×
        </button>
      )}
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} role="dialog" label={ariaLabel}>
          {wheel ? (
            <WheelPanel
              mode={mode}
              date={date}
              time={time}
              disablePast={disablePast}
              taken={taken}
              onCancel={() => setAnchor(null)}
              onPick={(d, t) => {
                setAnchor(null);
                onChange(mode === 'date' ? d : mode === 'time' ? t : `${d}T${t}`);
              }}
            />
          ) : (
          <PickerPanel
            mode={mode}
            date={date}
            time={time}
            onCancel={() => setAnchor(null)}
            onPick={(d, t) => {
              setAnchor(null);
              onChange(mode === 'date' ? d : mode === 'time' ? t : `${d}T${t}`);
            }}
          />
          )}
        </Popover>
      )}
    </div>
  );
}

/** Date only — value "YYYY-MM-DD" (drop-in for DateField24 / <input type="date">). */
export function PickDate({ value, onChange, placeholder = 'เลือกวันที่', wheel, disablePast, taken }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; yearsAhead?: number; yearsBehind?: number; wheel?: boolean; disablePast?: boolean; taken?: string[] }) {
  return <PickField mode="date" value={value} onChange={onChange} placeholder={placeholder} ariaLabel="วันที่" wheel={wheel} disablePast={disablePast} taken={taken} />;
}

/** 24-hour time — value "HH:MM" (drop-in for TimeField24). */
export function PickTime({ value, onChange, wheel }: { value: string; onChange: (v: string) => void; className?: string; wheel?: boolean }) {
  return <PickField mode="time" value={value} onChange={onChange} placeholder="เลือกเวลา" ariaLabel="เวลา" clearable={false} wheel={wheel} />;
}

/** Date + time — value "YYYY-MM-DDTHH:MM" (drop-in for DateTimePicker / DateTimeField24). */
export function PickDateTime({ value, onChange, invalid, wheel, disablePast }: { value: string; onChange: (v: string) => void; invalid?: boolean; className?: string; wheel?: boolean; disablePast?: boolean }) {
  return <PickField mode="datetime" value={value} onChange={onChange} invalid={invalid} placeholder="เลือกวันและเวลา" ariaLabel="วันและเวลา" wheel={wheel} disablePast={disablePast} />;
}
