/**
 * Brand marks for social links — one per `SocialKind` in lib/teacher-profile.ts.
 * Single-colour glyphs that take `currentColor`, used by the marketing footer
 * and the contact band on a host's profile.
 */
import type { ReactNode } from 'react';
import type { SocialKind } from '@/lib/teacher-profile';

const GLYPHS: Record<SocialKind, ReactNode> = {
  facebook: <path fill="currentColor" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12" />,
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" />
    </g>
  ),
  line: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M12 2.8c-5.5 0-10 3.6-10 8 0 4 3.5 7.3 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.6 1.1-.5 5.9-3.5 8-6 1.4-1.6 2.1-3.2 2.1-4.9 0-4.4-4.5-8-10-8ZM6.3 8.6a.6.6 0 0 1 .6.6v3.3h1.7a.6.6 0 1 1 0 1.2H6.3a.6.6 0 0 1-.6-.6V9.2a.6.6 0 0 1 .6-.6Zm3.7 0a.6.6 0 0 1 .6.6v3.9a.6.6 0 1 1-1.2 0V9.2a.6.6 0 0 1 .6-.6Zm1.8 0c.2 0 .4.1.5.3l2 2.6V9.2a.6.6 0 1 1 1.2 0v3.9a.6.6 0 0 1-1.1.4l-2-2.7v2.3a.6.6 0 1 1-1.2 0V9.2c0-.3.3-.6.6-.6Zm4.4 0h2.1a.6.6 0 1 1 0 1.2h-1.5v.7h1.5a.6.6 0 1 1 0 1.2h-1.5v.7h1.5a.6.6 0 1 1 0 1.2h-2.1a.6.6 0 0 1-.6-.6V9.2c0-.3.3-.6.6-.6Z"
    />
  ),
  tiktok: <path fill="currentColor" d="M16.6 5.1c-.9-.8-1.5-1.9-1.6-3.1h-3.1v13.9a3 3 0 1 1-2.1-2.9v-3.2A6.1 6.1 0 0 0 9 9.6a6.2 6.2 0 1 0 6.1 6.2V9.4a8.3 8.3 0 0 0 4.9 1.6V8a4.9 4.9 0 0 1-3.4-2.9" />,
  youtube: <path fill="currentColor" d="M21.6 7.6a3 3 0 0 0-2.1-2.1C17.7 5 12 5 12 5s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.1C2 9.4 2 12 2 12s0 2.6.4 4.4a3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1c.4-1.8.4-4.4.4-4.4s0-2.6-.4-4.4M10 15.2V8.8l5.5 3.2z" />,
  x: <path fill="currentColor" d="M18.2 2.2h3.3l-7.2 8.3 8.5 11.3h-6.6l-5.2-6.8-6 6.8H1.7l7.7-8.8L1.2 2.2H8l4.7 6.2zm-1.2 17.9h1.8L7.1 4H5.2z" />,
  website: (
    <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
    </g>
  ),
};

export function SocialIcon({ kind, size = 18 }: { kind: SocialKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {GLYPHS[kind]}
    </svg>
  );
}

export default SocialIcon;
