'use client';

import './coupons.css';

/**
 * A coupon drawn as a ticket: coloured stub with the value, a punched
 * perforation, then the name, what it gives and one line of detail (expiry,
 * or why it cannot be used here). Pass `onClick` to make it pickable.
 */
export function CouponTicket({
  big,
  name,
  line,
  meta,
  why,
  code,
  tone = 'teal',
  off,
  picked,
  size,
  onClick,
}: {
  big: string;
  name: string;
  line?: string;
  meta?: string | null;
  /** Shown in place of `meta`, in warning colour, when it cannot be used. */
  why?: string | null;
  code?: string;
  tone?: 'teal' | 'accent' | 'ink';
  off?: boolean;
  picked?: boolean;
  size?: 'big';
  onClick?: () => void;
}) {
  const cls = `cp-ticket${off ? ' is-off' : ''}${picked ? ' is-picked' : ''}${size === 'big' ? ' is-big' : ''}`;
  const inner = (
    <>
      <span className="cp-stub">
        <b className="cp-big">{big}</b>
        <span className="cp-stub-sub">{big === 'ฟรี' ? 'free' : 'coupon'}</span>
      </span>
      <span className="cp-perf" aria-hidden="true" />
      <span className="cp-body">
        <span className="cp-name">{name}</span>
        {line && <span className="cp-line">{line}</span>}
        {why ? <span className="cp-meta is-why">{why}</span> : meta ? <span className="cp-meta">{meta}</span> : null}
        {code && <span className="cp-code">{code}</span>}
      </span>
      {onClick && (
        <span className="cp-side">
          <span className="cp-check">✓</span>
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} data-tone={tone} onClick={onClick} disabled={off} aria-pressed={!!picked}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} data-tone={tone}>
      {inner}
    </div>
  );
}

/** "ใช้ได้ถึง 31 ธ.ค. 69" from a Thai wall-clock "YYYY-MM-DDTHH:MM". */
export function untilLabel(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const [d] = endsAt.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `ใช้ได้ถึง ${day} ${MON[(m || 1) - 1]} ${((y || 0) + 543) % 100}`;
}

/** Stub colour by kind: free coupons stand out in accent. */
export function toneFor(kind: string): 'teal' | 'accent' {
  return kind === 'free' ? 'accent' : 'teal';
}
