'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The admin console frame ("Admin Dashboard v3"): an ink sidebar grouped by
 * area; under 1024px it slides in as a drawer from a top bar, and under 760px a
 * tab bar of the four busiest pages sits at the bottom. Styles: app/admin/admin.css.
 */

type Item = { href: string; label: string; d: string; d2?: string };

const I = {
  overview: { href: '/admin', label: 'ภาพรวม', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  insights: { href: '/admin/insights', label: 'ข้อมูลเชิงลึก', d: 'M4 19V9m5 10V5m5 14v-7m5 7V8' },
  workshops: { href: '/admin/workshops', label: 'กิจกรรม (รอบ)', d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  info: { href: '/admin/workshop-info', label: 'ข้อมูลกิจกรรม', d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  locations: { href: '/admin/locations', label: 'สถานที่', d: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z', d2: 'M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
  articles: { href: '/admin/articles', label: 'บทความ', d: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
  reviews: { href: '/admin/reviews', label: 'รีวิว', d: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  users: { href: '/admin/users', label: 'ผู้ใช้งาน', d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  groups: { href: '/admin/groups', label: 'จองแบบกลุ่ม', d: 'M17 20h5v-1a4 4 0 00-5.5-3.7M17 20H7m10 0v-1c0-.7-.1-1.3-.3-1.9M7 20H2v-1a4 4 0 015.5-3.7M7 20v-1c0-.7.1-1.3.3-1.9m0 0a5 5 0 019.4 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  transfers: { href: '/admin/transfers', label: 'โอนย้ายสิทธิ์', d: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
  revenue: { href: '/admin/revenue', label: 'รายรับ', d: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  coupons: { href: '/admin/coupons', label: 'คูปอง', d: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  gp: { href: '/admin/gp', label: 'ค่าธรรมเนียม GP', d: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  ledger: { href: '/admin/ledger', label: 'บัญชีการเงิน', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  payments: { href: '/admin/payments', label: 'ตรวจเงินเข้า', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  export: { href: '/admin/finance-export', label: 'ทดสอบ Export API', d: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4' },
} satisfies Record<string, Item>;

type Key = keyof typeof I;

const GROUPS: [string, Key[]][] = [
  ['', ['overview', 'insights']],
  ['กิจกรรม', ['workshops', 'info', 'locations']],
  ['เนื้อหา', ['articles', 'reviews']],
  ['ผู้ใช้ & การจอง', ['users', 'groups', 'transfers']],
  ['การเงิน', ['revenue', 'ledger', 'gp', 'payments', 'coupons', 'export']],
];

const TABS: Key[] = ['overview', 'workshops', 'users', 'revenue'];

/** The nav entry a path belongs to: exact for /admin, else the longest prefix. */
function activeKey(pathname: string): Key | null {
  if (pathname === '/admin' || pathname === '/admin/') return 'overview';
  let best: Key | null = null;
  for (const k of Object.keys(I) as Key[]) {
    const h = I[k].href;
    if (h !== '/admin' && pathname.startsWith(h) && (!best || h.length > I[best].href.length)) best = k;
  }
  return best;
}

function NavIcon({ item, size = 20 }: { item: Item; size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.d} />
      {item.d2 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.d2} />}
    </svg>
  );
}

/** The AllSoulLearn triangle "A", white, in the teal disc. */
function Mark({ size }: { size: number }) {
  return (
    <span className="adm-brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 74 74" width={size * 0.56} height={size * 0.56}>
        <path d="M31,4 L43.7,4 L70.9,70 L3,70 Z M36.95,23.8 L47.1,45.4 L24.9,58.2 Z" fill="#fff" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm dialog + toast (design "Dialog" and the ✓ toast)           */
/* ------------------------------------------------------------------ */

type DialogReq = {
  title: string;
  msg?: string;
  ok: string;
  cancel: string | null;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

let pushDialog: ((r: DialogReq) => void) | null = null;
let pushToast: ((m: string) => void) | null = null;

/** Ask before doing something. Resolves true on the main button. */
export function adminConfirm(o: { title: string; msg?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  if (!pushDialog) return Promise.resolve(window.confirm(o.msg ? `${o.title}\n${o.msg}` : o.title));
  return new Promise((resolve) => pushDialog!({ title: o.title, msg: o.msg, ok: o.ok || 'ยืนยัน', cancel: 'ยกเลิก', danger: !!o.danger, resolve }));
}

/** Tell the admin something went wrong (one button). */
export function adminAlert(title: string, msg?: string): Promise<void> {
  if (!pushDialog) {
    window.alert(msg ? `${title}\n${msg}` : title);
    return Promise.resolve();
  }
  return new Promise((resolve) => pushDialog!({ title, msg, ok: 'รับทราบ', cancel: null, danger: false, resolve: () => resolve() }));
}

/** A short "✓ saved" note at the bottom of the screen. */
export function adminToast(message: string) {
  pushToast?.(message);
}

function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    pushDialog = (r) => setQueue((q) => [...q, r]);
    pushToast = (text) => setToast({ id: Date.now(), text });
    return () => {
      pushDialog = null;
      pushToast = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const top = queue[0];
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        top.resolve(false);
        setQueue((q) => q.slice(1));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [top]);

  const answer = (ok: boolean) => {
    top?.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <>
      {top && (
        <div className="adm-dlg-scrim" onClick={() => answer(false)}>
          <div className="adm-dlg" role="alertdialog" aria-modal="true" aria-labelledby="adm-dlg-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="adm-dlg-title">{top.title}</h3>
            {top.msg && <p>{top.msg}</p>}
            <div className="adm-dlg-acts">
              {top.cancel && (
                <button type="button" className="adm-btn" onClick={() => answer(false)}>
                  {top.cancel}
                </button>
              )}
              <button type="button" className={`adm-btn ${top.danger ? 'bad' : 'teal'}`} onClick={() => answer(true)} autoFocus>
                {top.ok}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="adm-toast" role="status" key={toast.id}>
          ✓ {toast.text}
        </div>
      )}
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin';
  /** The drawer, and the path it was opened on — moving to another page closes it. */
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  /** Unresolved money that needs a human (a badge on ตรวจเงินเข้า). */
  const [pending, setPending] = useState(0);
  /** Urgent open alerts on Admin Insights (a badge on ข้อมูลเชิงลึก). */
  const [urgent, setUrgent] = useState(0);
  const current = activeKey(pathname);

  useEffect(() => {
    fetch('/api/admin/orphan-payments')
      .then((r) => (r.ok ? (r.json() as Promise<{ unresolved?: number }>) : null))
      .then((d) => setPending(d?.unresolved || 0))
      .catch(() => {});
    fetch('/api/admin/alerts')
      .then((r) => (r.ok ? (r.json() as Promise<{ bad?: number }>) : null))
      .then((d) => setUrgent(d?.bad || 0))
      .catch(() => {});
  }, []);

  // Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpenOn(null);
  const show = () => setOpenOn(pathname);

  return (
    <div className={`adm${open ? ' nav-open' : ''}`}>
      <div className="adm-backdrop" onClick={close} aria-hidden="true" />
      <aside className="adm-side" aria-label="เมนูผู้ดูแล">
        <div className="adm-brand">
          <Mark size={34} />
          <div className="adm-brand-text">
            <b>soulsilent</b>
            <span>ADMIN CONSOLE</span>
          </div>
          <button type="button" className="adm-side-close" onClick={close} aria-label="ปิดเมนู">
            ×
          </button>
        </div>
        <nav className="adm-nav">
          {GROUPS.map(([label, keys]) => (
            <div key={label || 'home'} className="adm-nav-group">
              {label && <div className="adm-nav-label">{label}</div>}
              {keys.map((k) => {
                const item: Item = I[k];
                const badge = k === 'payments' ? pending : k === 'insights' ? urgent : 0;
                return (
                  <Link
                    key={k}
                    href={item.href}
                    onClick={close}
                    className={`adm-nav-link${current === k ? ' is-on' : ''}`}
                    aria-current={current === k ? 'page' : undefined}
                  >
                    <NavIcon item={item} />
                    <span>{item.label}</span>
                    {badge > 0 && <b className="adm-nav-badge">{badge}</b>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="adm-side-foot">
          <Link href="/" className="adm-nav-link">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            <span>กลับหน้าเว็บ</span>
          </Link>
        </div>
      </aside>

      <div className="adm-col">
        <div className="adm-top">
          <button type="button" className="adm-top-btn" onClick={show} aria-label="เปิดเมนู">
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Mark size={28} />
          <div className="adm-top-title">{current ? I[current].label : 'ผู้ดูแล'}</div>
          <span className="adm-top-tag">ADMIN</span>
        </div>

        <main className="adm-main">{children}</main>

        <nav className="adm-tabbar" aria-label="ทางลัด">
          {TABS.map((k) => (
            <Link key={k} href={I[k].href} className={`adm-tab${current === k ? ' is-on' : ''}`}>
              <NavIcon item={I[k]} size={22} />
              <span>{k === 'workshops' ? 'กิจกรรม' : I[k].label}</span>
            </Link>
          ))}
          <button type="button" className="adm-tab" onClick={show}>
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={1.6} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span>เมนู</span>
          </button>
        </nav>
      </div>
      <DialogHost />
    </div>
  );
}

/** Page header: mono eyebrow, Mitr title, muted line, actions on the right. */
export function AdminHead({
  eyebrow,
  title,
  sub,
  back,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="adm-head">
      <div className="adm-head-text">
        {back && (
          <Link href={back.href} className="adm-back">
            ← {back.label}
          </Link>
        )}
        <p className="adm-eyebrow">{eyebrow}</p>
        <h1 className="adm-h1">{title}</h1>
        {sub && <p className="adm-sub">{sub}</p>}
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </header>
  );
}

/** Search box with a clear button. */
export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="adm-search">
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeWidth={1.8} d="M20 20l-3.5-3.5" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="adm-search-clear" onClick={() => onChange('')} aria-label="ล้าง">
          ×
        </button>
      )}
    </div>
  );
}

/** Filter chips: ink when on, white otherwise, with an optional count. */
export function AdminChips<K extends string>({
  value,
  onChange,
  items,
}: {
  value: K;
  onChange: (k: K) => void;
  items: { key: K; label: string; n?: number }[];
}) {
  return (
    <div className="adm-chips" role="tablist">
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={value === c.key}
          className={`adm-chip${value === c.key ? ' is-on' : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
          {c.n != null && <i>{c.n}</i>}
        </button>
      ))}
    </div>
  );
}

/** `‹ 1 2 3 ›` pager; nothing for a single page. */
export function AdminPager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null;
  const pages: (number | 'gap')[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }
  return (
    <nav className="adm-pager" aria-label="เปลี่ยนหน้า">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="ก่อนหน้า">
        ‹
      </button>
      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`g${i}`} className="adm-meta">
            …
          </span>
        ) : (
          <button key={p} type="button" className={p === page ? 'is-on' : ''} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}>
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="ถัดไป">
        ›
      </button>
    </nav>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'mute' | 'info' | 'teal';

/** Small pill badge with a dot. */
export function Badge({ tone = 'mute', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`adm-badge ${tone}`}>{children}</span>;
}

/**
 * Modal sheet for admin forms: centred card on desktop, bottom sheet on a
 * phone. Header (eyebrow + title + sub + close), scrolling body, optional
 * sticky footer.
 */
export function AdminSheet({
  open,
  onClose,
  eyebrow,
  title,
  sub,
  width,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="adm-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <section
        className="adm-sheet"
        role="dialog"
        aria-modal="true"
        style={width ? ({ '--adm-sheet-w': `${width}px` } as React.CSSProperties) : undefined}
      >
        <header className="adm-sheet-head">
          <div>
            {eyebrow && <p className="adm-eyebrow" style={{ margin: 0 }}>{eyebrow}</p>}
            <h2 className="adm-sheet-title">{title}</h2>
            {sub && <p className="adm-sheet-sub">{sub}</p>}
          </div>
          <button type="button" className="adm-sheet-close" onClick={onClose} aria-label="ปิด">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="adm-sheet-body">{children}</div>
        {footer && <div className="adm-sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

/** A numbered section inside an AdminSheet form. */
export function SheetSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="adm-sec">
      <div className="adm-sec-head">
        <p className="adm-sec-num">{String(n).padStart(2, '0')}</p>
        <h3 className="adm-sec-title">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export type MenuItem ={ label: string; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean };

/**
 * The "⋯" button and its menu. On a desktop it opens as a small popover under
 * the button (fixed-positioned, so a scrolling table never clips it); on a
 * phone it rises as a sheet from the bottom.
 */
export function RowMenu({ items, label = 'เพิ่มเติม' }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number; sheet: boolean } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    if (!pos.sheet) window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  if (items.length === 0) return null;

  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sheet = window.matchMedia('(max-width: 759px)').matches;
    const below = r.bottom + 6;
    const tall = 46 * items.length + 16;
    setPos({ top: below + tall > window.innerHeight ? Math.max(8, r.top - tall - 6) : below, right: Math.max(8, window.innerWidth - r.right), sheet });
  };
  const run = (it: MenuItem) => {
    setPos(null);
    it.onClick?.();
  };

  return (
    <>
      <button type="button" className="adm-icon-btn" onClick={open} aria-label={label} aria-haspopup="menu" aria-expanded={!!pos}>
        <MoreIcon />
      </button>
      {pos && (
        <>
          <div className={`adm-menu-scrim${pos.sheet ? ' is-sheet' : ''}`} onClick={() => setPos(null)} aria-hidden="true" />
          <div
            role="menu"
            className={`adm-menu${pos.sheet ? ' is-sheet' : ''}`}
            style={pos.sheet ? undefined : { top: pos.top, right: pos.right }}
          >
            {items.map((it) =>
              it.href ? (
                <Link key={it.label} role="menuitem" href={it.href} className={`adm-menu-item${it.danger ? ' danger' : ''}`} onClick={() => setPos(null)}>
                  {it.label}
                </Link>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  className={`adm-menu-item${it.danger ? ' danger' : ''}`}
                  onClick={() => run(it)}
                >
                  {it.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </>
  );
}

/** The "⋯" glyph. */
export function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
