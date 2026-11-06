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
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const pad = (n: number) => String(n).padStart(2, '0');
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

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
  onScrim,
  role,
  label,
  children,
}: {
  anchor: Anchor;
  onClose: () => void;
  /** A tap outside the box; defaults to onClose. */
  onScrim?: () => void;
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
      <div className={`adm-pop-scrim${anchor.sheet ? ' is-sheet' : ''}`} onClick={onScrim ?? onClose} aria-hidden="true" />
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
/*                                                                     */
/* Every column is a scroll wheel (day / month / year, hour / minute): */
/* scroll, mouse-wheel, drag with the left button, or tap a number.    */
/* There is no OK button — tapping outside the box keeps the choice,   */
/* Esc leaves the field as it was. Tapping the chosen date again       */
/* clears it.                                                          */
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

const ROW = 52;
const QUICK_TIMES = ['08:00', '09:00', '10:00', '13:00', '14:00', '17:00', '18:00', '19:00'];
const HOURS = Array.from({ length: 24 }, (_, i) => ({ v: pad(i), label: pad(i) }));
const MINS = Array.from({ length: 12 }, (_, i) => ({ v: pad(i * 5), label: pad(i * 5) }));
const MONTHS = TH_MON.map((label, i) => ({ v: String(i), label }));
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

type WheelItem = { v: string; label: string; off?: boolean; tint?: boolean };

function WheelCol({
  label,
  items,
  value,
  onChange,
  onTapCurrent,
  dim,
  width = 84,
}: {
  label: string;
  items: WheelItem[];
  value: string;
  onChange: (v: string) => void;
  onTapCurrent?: () => void;
  dim?: boolean;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fromWheel = useRef(false);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const idx = Math.max(0, items.findIndex((it) => it.v === value));

  // Follow the value when it changes from outside (a quick-time chip, a
  // month change that clamps the day, the first open) — not after the
  // user's own scroll set it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fromWheel.current) {
      fromWheel.current = false;
      return;
    }
    el.scrollTo({ top: idx * ROW, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [idx, items.length]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = (i: number) => {
    const it = items[Math.min(items.length - 1, Math.max(0, i))];
    if (it && it.v !== value) {
      fromWheel.current = true;
      onChange(it.v);
    }
  };
  const onScroll = () => {
    if (drag.current?.moved) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (el) settle(Math.round(el.scrollTop / ROW));
    }, 90);
  };

  // Mouse drag: hold the left button and move up/down to spin the column.
  // Touch already scrolls natively, so only mouse pointers are handled.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { y: e.clientY, top: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) > 3) {
      // capture only once it is a real drag, so a plain click still hits the item
      d.moved = true;
      el.style.scrollSnapType = 'none';
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
    }
    if (d.moved) el.scrollTop = d.top - dy;
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    if (!d.moved) {
      drag.current = null;
      return;
    }
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.style.cursor = '';
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
    el.scrollTo({ top: i * ROW, behavior: 'smooth' });
    settle(i); // keep it at once, so a tap outside right after still saves it
    setTimeout(() => {
      if (ref.current) ref.current.style.scrollSnapType = 'y mandatory';
    }, 350);
    // a drag must not count as a click on the item under the pointer
    setTimeout(() => (drag.current = null), 0);
  };

  const mask = 'linear-gradient(180deg, transparent 0, #000 34%, #000 66%, transparent 100%)';
  return (
    <div style={{ position: 'relative', width, height: ROW * 3, flexShrink: 0 }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, borderRadius: 14, background: 'var(--cream)', pointerEvents: 'none' }} />
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        role="listbox"
        aria-label={label}
        style={{ position: 'relative', height: ROW * 3, overflowY: 'auto', cursor: 'grab', userSelect: 'none', touchAction: 'pan-y', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', overscrollBehavior: 'contain', WebkitMaskImage: mask, maskImage: mask }}
      >
        <div style={{ height: ROW }} />
        {items.map((it, i) => {
          const on = i === idx;
          const strong = on && !dim;
          return (
            <button
              key={it.v}
              type="button"
              role="option"
              aria-selected={strong}
              onClick={() => {
                if (on) onTapCurrent?.();
                else ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' });
              }}
              style={{
                display: 'block',
                width: '100%',
                height: ROW,
                scrollSnapAlign: 'center',
                fontFamily: "Mitr, 'IBM Plex Sans Thai', sans-serif",
                fontWeight: 400,
                fontSize: strong ? 28 : 21,
                lineHeight: `${ROW}px`,
                color: strong ? 'var(--ink)' : it.tint ? 'var(--teal)' : 'rgba(13,30,29,.35)',
                opacity: it.off ? 0.35 : 1,
                textDecoration: it.off ? 'line-through' : undefined,
                transition: 'font-size .15s, color .15s',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {it.label}
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
  disablePast,
  taken,
  onPick,
  commitRef,
}: {
  mode: 'date' | 'time' | 'datetime';
  date: string;
  time: string;
  disablePast?: boolean;
  taken?: string[];
  onPick: (date: string, time: string) => void;
  /** Filled with "keep what is on the wheels" — run on a tap outside. */
  commitRef: { current: (() => void) | null };
}) {
  const [today] = useState(todayIso);
  const [ty, tm, td] = today.split('-').map(Number);
  const [ymd, setYmd] = useState(() => {
    const [y, m, d] = (date || today).split('-').map(Number);
    return { y, m: m - 1, d };
  });
  const [isSet, setIsSet] = useState(!!date);
  const [t, setT] = useState(() => {
    const [h0 = '09', m0 = '00'] = (time || '09:00').split(':');
    return `${pad(Math.min(23, Number(h0) || 0))}:${pad(Math.min(55, Math.round(Number(m0) / 5) * 5))}`;
  });
  const [h, mi] = t.split(':');
  const hasDate = mode !== 'time';
  const hasTime = mode !== 'date';
  const iso = isoOf(ymd.y, ymd.m, ymd.d);

  useEffect(() => {
    commitRef.current = () => onPick(hasDate && isSet ? iso : '', t);
  });

  const pickDate = (y: number, m: number, d: number) => {
    let next = { y, m, d: Math.min(d, daysIn(y, m)) };
    if (disablePast && isoOf(next.y, next.m, next.d) < today) next = { y: ty, m: tm - 1, d: td };
    setYmd(next);
    setIsSet(true);
  };
  const toggleSet = () => setIsSet((v) => !v);

  // Years: a few back and ahead, always including the value's own year.
  const yFrom = Math.min(disablePast ? ty : ty - 5, ymd.y);
  const yTo = Math.max(ty + 5, ymd.y);
  const years = Array.from({ length: yTo - yFrom + 1 }, (_, i) => ({ v: String(yFrom + i), label: String(yFrom + i + 543), off: !!disablePast && yFrom + i < ty }));
  const months = MONTHS.map((mo) => ({ ...mo, off: !!disablePast && (ymd.y < ty || (ymd.y === ty && Number(mo.v) < tm - 1)) }));
  const days = Array.from({ length: daysIn(ymd.y, ymd.m) }, (_, i) => {
    const di = isoOf(ymd.y, ymd.m, i + 1);
    return { v: String(i + 1), label: String(i + 1), off: !!disablePast && di < today, tint: !!taken?.includes(di) };
  });

  const summary =
    mode === 'time' ? `${t} น.` : !isSet ? 'ยังไม่ได้เลือกวัน' : mode === 'date' ? fmtThaiDate(iso) : `${fmtThaiDate(iso)} · ${t} น.`;

  return (
    <div className="adm-dp" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, paddingBottom: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'none' }}>
        {hasDate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="adm-label" style={{ flex: 1 }}>
                วัน · เดือน · ปี
              </span>
              <button
                type="button"
                onClick={() => pickDate(ty, tm - 1, td)}
                style={{ height: 32, padding: '0 14px', borderRadius: 999, background: 'var(--cream)', fontSize: 12.5, fontWeight: 600 }}
              >
                วันนี้
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <WheelCol label="วัน" width={64} dim={!isSet} items={days} value={String(ymd.d)} onChange={(v) => pickDate(ymd.y, ymd.m, Number(v))} onTapCurrent={toggleSet} />
              <WheelCol label="เดือน" width={84} dim={!isSet} items={months} value={String(ymd.m)} onChange={(v) => pickDate(ymd.y, Number(v), ymd.d)} onTapCurrent={toggleSet} />
              <WheelCol label="ปี" width={88} dim={!isSet} items={years} value={String(ymd.y)} onChange={(v) => pickDate(Number(v), ymd.m, ymd.d)} onTapCurrent={toggleSet} />
            </div>
            {isSet && taken?.includes(iso) && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--teal)', margin: 0 }}>วันนี้เลือกไว้แล้ว</p>}
          </div>
        )}
        {hasTime && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(hasDate ? { borderTop: '1px solid #eef0ef', paddingTop: 12 } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <WheelCol label="ชั่วโมง" items={HOURS} value={h} onChange={(v) => setT(`${v}:${mi}`)} />
              <span style={{ fontFamily: "Mitr, sans-serif", fontWeight: 300, fontSize: 28, color: 'var(--muted)' }}>:</span>
              <WheelCol label="นาที" items={MINS} value={mi} onChange={(v) => setT(`${h}:${v}`)} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>น.</span>
            </div>
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
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          เลื่อนขึ้น–ลง ลากด้วยเมาส์ หรือแตะตัวเลข{hasDate ? ' · แตะวันที่เลือกซ้ำเพื่อล้าง' : ''}
        </p>
      </div>
      <div className="adm-dp-foot" style={{ flexShrink: 0, padding: '10px 0', borderTop: '1px solid #eef0ef', background: '#fff' }}>
        <span style={hasDate && !isSet ? { color: '#a04a14' } : undefined}>{summary}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', flex: 'none' }}>แตะนอกกล่องเพื่อเลือก</span>
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
  disablePast,
  taken,
}: {
  mode: 'date' | 'time' | 'datetime';
  value: string;
  onChange: (v: string) => void;
  disablePast?: boolean;
  taken?: string[];
  invalid?: boolean;
  clearable?: boolean;
  placeholder: string;
  ariaLabel: string;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const commitRef = useRef<(() => void) | null>(null);
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
        onClick={(e) => setAnchor(anchorOf(e.currentTarget, 320, mode === 'datetime' ? 520 : mode === 'time' ? 400 : 300))}
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
        <Popover anchor={anchor} onClose={() => setAnchor(null)} onScrim={() => commitRef.current?.()} role="dialog" label={ariaLabel}>
          <WheelPanel
            mode={mode}
            date={date}
            time={time}
            disablePast={disablePast}
            taken={taken}
            commitRef={commitRef}
            onPick={(d, t) => {
              setAnchor(null);
              const next = mode === 'date' ? d : mode === 'time' ? t : d ? `${d}T${t}` : '';
              if (next !== (value || '')) onChange(next);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

/** Date only — value "YYYY-MM-DD" (drop-in for DateField24 / <input type="date">). */
export function PickDate({ value, onChange, placeholder = 'เลือกวันที่', disablePast, taken }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; yearsAhead?: number; yearsBehind?: number; wheel?: boolean; disablePast?: boolean; taken?: string[] }) {
  return <PickField mode="date" value={value} onChange={onChange} placeholder={placeholder} ariaLabel="วันที่" disablePast={disablePast} taken={taken} />;
}

/** 24-hour time — value "HH:MM" (drop-in for TimeField24). */
export function PickTime({ value, onChange }: { value: string; onChange: (v: string) => void; className?: string; wheel?: boolean }) {
  return <PickField mode="time" value={value} onChange={onChange} placeholder="เลือกเวลา" ariaLabel="เวลา" clearable={false} />;
}

/** Date + time — value "YYYY-MM-DDTHH:MM" (drop-in for DateTimePicker / DateTimeField24). */
export function PickDateTime({ value, onChange, invalid, disablePast }: { value: string; onChange: (v: string) => void; invalid?: boolean; className?: string; wheel?: boolean; disablePast?: boolean }) {
  return <PickField mode="datetime" value={value} onChange={onChange} invalid={invalid} placeholder="เลือกวันและเวลา" ariaLabel="วันและเวลา" disablePast={disablePast} />;
}
