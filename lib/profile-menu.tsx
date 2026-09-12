import type { ReactNode } from 'react';

export type ProfileMenuItem = {
  key: string;
  href: string;
  th: string;
  en: string;
  /** External = lives outside the /me settings layout (own full-page route). */
  external?: boolean;
  /** If set, only these roles see this item (e.g. Portfolio = teacher/admin). */
  roles?: Array<'user' | 'teacher' | 'admin'>;
  icon: ReactNode;
};

/** Filter the menu by the current user's role (items with no `roles` show to all). */
export function menuForRole(role?: string | null, roles?: string[] | null): ProfileMenuItem[] {
  const held = roles && roles.length ? roles : role ? [role] : [];
  return PROFILE_MENU.filter((m) => !m.roles || m.roles.some((r) => held.includes(r)));
}

const iconCls = 'w-[18px] h-[18px] flex-shrink-0';

/**
 * Single source of truth for the profile dropdown (header) AND the settings
 * sidebar (/me layout). Order matters — it is the display order in both places.
 * `Logout` is intentionally NOT here (it's an action, not a navigation item).
 */
export const PROFILE_MENU: ProfileMenuItem[] = [
  {
    key: 'account',
    href: '/me/settings?tab=account',
    th: 'จัดการบัญชี',
    en: 'Account',
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 11c0-1.657 1.343-3 3-3m-6 3a3 3 0 100-6 3 3 0 000 6zm0 0c-3 0-5 1.5-5 4v2h7" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 14l1.5 1.5L20 12" />
      </svg>
    ),
  },
  {
    key: 'portfolio',
    href: '/me/portfolio',
    th: 'Portfolio',
    en: 'Portfolio',
    roles: ['teacher', 'admin'],
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 7h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      </svg>
    ),
  },
  {
    key: 'calendar',
    href: '/calendar',
    th: 'ปฏิทิน',
    en: 'Calendar',
    external: true,
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2.5" strokeWidth={1.6} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 9.5H21M8 3v3.5M16 3v3.5" />
      </svg>
    ),
  },
  {
    key: 'bookings',
    href: '/me/bookings',
    th: 'การจอง',
    en: 'Bookings',
    external: true,
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 3h14a1 1 0 011 1v16l-4-2-4 2-4-2-4 2V4a1 1 0 011-1z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 8h6M9 12h6" />
      </svg>
    ),
  },
  {
    key: 'journey',
    href: '/me/journey',
    th: 'My Journey',
    en: 'My Journey',
    external: true,
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 20l-5.5 2.5L5 15l-3-3 6-1 4-8 4 8 6 1-3 3 1.5 7.5L15 20" />
      </svg>
    ),
  },
  {
    key: 'help',
    href: '/help',
    th: 'ช่วยเหลือ',
    en: 'Help',
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.6} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.5 9.5a2.5 2.5 0 014.5 1.5c0 1.5-2 2-2 3.5M12 17h.01" />
      </svg>
    ),
  },
  {
    key: 'settings',
    href: '/me/settings',
    th: 'ตั้งค่า',
    en: 'Settings',
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" strokeWidth={1.6} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];
