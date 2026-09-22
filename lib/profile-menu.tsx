import type { ReactNode } from 'react';

export type ProfileMenuItem = {
  key: string;
  href: string;
  th: string;
  en: string;
  /** External = lives outside the /me settings layout (own full-page route). */
  external?: boolean;
  /** If set, only these roles see this item (e.g. Portfolio = admin). */
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
 * The profile dropdown (header). Order matters — it is the display order.
 * Account and settings are reached from the "แก้ไขโปรไฟล์" button above the
 * list, the calendar from the labelled icon in the bar; `Logout` is
 * intentionally NOT here (it's an action, not a navigation item).
 */
export const PROFILE_MENU: ProfileMenuItem[] = [
  {
    key: 'portfolio',
    href: '/me/portfolio',
    th: 'Portfolio',
    en: 'Portfolio',
    roles: ['admin'],
    icon: (
      <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 7h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
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
];
