'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { menuForRole } from '@/lib/profile-menu';

export interface ProfileUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  cover_image_url?: string | null;
  nickname?: string | null;
  date_of_birth?: string | null;
}

/** Years from a YYYY-MM-DD birthdate, or null. */
function calcAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function ProfileDropdown({
  user,
  current,
  onClose,
  onLogout,
}: {
  user: ProfileUser;
  current?: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);

  // On mobile the menu is a fixed bottom sheet. It must be portaled to <body>:
  // `.nav-wrap` (its normal parent) has `-webkit-backdrop-filter`, which creates
  // a containing block for `position:fixed` descendants — so a non-portaled sheet
  // anchors to the ~68px header instead of the viewport and lands at the top with
  // its head cut off. Desktop keeps the in-place absolute popover (anchored to the
  // trigger), so we only portal on mobile.
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 560px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  const display = user.nickname || user.name;
  const age = calcAge(user.date_of_birth);

  const tree = (
    <>
      {/* Dim backdrop — only shown on mobile where the menu is a bottom sheet. */}
      <div className="prof-pop-backdrop" aria-hidden onClick={onClose} />
    <div
      ref={ref}
      className="prof-pop"
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 12px)',
        right: 0,
        width: 296,
        zIndex: 80,
        background: 'var(--paper)',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 24px 60px -18px rgba(13,30,29,.42), 0 0 0 1px rgba(13,30,29,.05)',
        transformOrigin: 'top right',
        animation: 'popIn .22s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      {/* header: cover + avatar */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            height: 74,
            background: user.cover_image_url
              ? undefined
              : 'linear-gradient(120deg, var(--teal) 0%, var(--teal-deep) 100%)',
            overflow: 'hidden',
          }}
        >
          {user.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ position: 'absolute', left: 20, top: 38 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--cream)',
              boxShadow: '0 0 0 4px var(--paper)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="display-en" style={{ fontSize: 26, color: 'var(--teal)' }}>
                {(display || '?')[0]?.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '26px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div
              className="display-th"
              style={{ fontSize: 19, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {display}
            </div>
            <div
              className="mono"
              style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {user.email}
            </div>
          </div>
          {age != null && (
            <span className="tag" style={{ flexShrink: 0, marginTop: 2 }}>
              {lang === 'th' ? `${age} ปี` : `age ${age}`}
            </span>
          )}
        </div>
        <Link
          href="/me/settings?tab=edit"
          role="menuitem"
          onClick={onClose}
          className="btn btn-paper"
          style={{ width: '100%', justifyContent: 'center', marginTop: 14, boxShadow: 'inset 0 0 0 1.5px var(--cream-deep)', fontSize: 13.5 }}
        >
          {tr(lang, 'แก้ไขโปรไฟล์', 'Edit profile')}
        </Link>
      </div>

      {/* menu list */}
      <div style={{ padding: '8px 10px 6px' }}>
        {menuForRole(user.role).map((m) => (
          <Link
            key={m.key}
            href={m.href}
            role="menuitem"
            onClick={onClose}
            className="prof-item"
            aria-current={current === m.key ? 'page' : undefined}
          >
            <span
              style={{
                display: 'inline-flex',
                width: 30,
                height: 30,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--cream)',
                color: 'var(--teal-deep)',
                flexShrink: 0,
              }}
            >
              {m.icon}
            </span>
            <span style={{ flex: 1 }}>{tr(lang, m.th, m.en)}</span>
            {m.external && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>
                ↗
              </span>
            )}
          </Link>
        ))}

        {/* Teacher / organizer dashboard */}
        {(user.role === 'teacher' || user.role === 'admin') && (
          <Link
            href="/teacher"
            role="menuitem"
            onClick={onClose}
            className="prof-item"
            aria-current={current === 'teacher' ? 'page' : undefined}
          >
            <span
              style={{
                display: 'inline-flex',
                width: 30,
                height: 30,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--teal)',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 5h16v11H4zM2 20h20" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 9h8M8 12h5" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>{tr(lang, 'แดชบอร์ดผู้สอน', 'Teacher dashboard')}</span>
          </Link>
        )}

        {/* Admin-only entry */}
        {user.role === 'admin' && (
          <Link
            href="/admin"
            role="menuitem"
            onClick={onClose}
            className="prof-item"
            aria-current={current === 'admin' ? 'page' : undefined}
          >
            <span
              style={{
                display: 'inline-flex',
                width: 30,
                height: 30,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--ink)',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>Admin Dashboard</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>
              ↗
            </span>
          </Link>
        )}
      </div>

      {/* logout */}
      <div style={{ padding: '6px 10px 14px' }}>
        <button type="button" role="menuitem" onClick={onLogout} className="prof-logout">
          <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 17l5-5-5-5M21 12H9M12 19H5a2 2 0 01-2-2V7a2 2 0 012-2h7" />
          </svg>
          <span>{tr(lang, 'ออกจากระบบ', 'Log out')}</span>
        </button>
      </div>
    </div>
    </>
  );

  // Escape the header's backdrop-filter containing block on mobile via a portal.
  return isMobile && mounted ? createPortal(tree, document.body) : tree;
}
