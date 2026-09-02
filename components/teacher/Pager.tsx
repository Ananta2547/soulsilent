'use client';

/**
 * `‹ 1 2 3 ›` for the teacher dashboard's lists.
 *
 * Every list there is paged rather than allowed to grow, so the dashboard stays
 * one screen tall; this is the control that does it, shared so the three pages
 * cannot drift into three slightly different pagers.
 *
 * Long runs collapse to `1 … 4 5 6 … 12`, so the row never wraps onto a second
 * line. Renders nothing for a single page — a pager under a list with nowhere
 * else to go is furniture.
 */
export function Pager({
  page,
  pageCount,
  onChange,
  label,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
  /** Names what is being paged, for screen readers. */
  label: string;
}) {
  if (pageCount <= 1) return null;

  const pages: (number | 'gap')[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const near = Math.abs(n - page) <= 1;
    const edge = n === 1 || n === pageCount;
    if (near || edge) pages.push(n);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  return (
    <nav
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flexWrap: 'wrap',
        padding: '14px 0 2px',
      }}
    >
      <Btn disabled={page === 1} onClick={() => onChange(page - 1)} label="หน้าก่อนหน้า">
        ‹
      </Btn>
      {pages.map((n, i) =>
        n === 'gap' ? (
          <span key={`gap${i}`} aria-hidden style={{ color: 'var(--muted)', padding: '0 2px' }}>
            …
          </span>
        ) : (
          <Btn key={n} active={n === page} onClick={() => onChange(n)} label={`หน้า ${n}`}>
            {n}
          </Btn>
        ),
      )}
      <Btn disabled={page === pageCount} onClick={() => onChange(page + 1)} label="หน้าถัดไป">
        ›
      </Btn>
    </nav>
  );
}

function Btn({
  children,
  onClick,
  active = false,
  disabled = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 32,
        height: 32,
        padding: '0 10px',
        borderRadius: 999,
        border: 0,
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'var(--teal)' : 'var(--cream)',
        color: active ? '#fff' : disabled ? 'var(--muted)' : 'var(--ink)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default Pager;
