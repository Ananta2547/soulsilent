'use client';

import { usePathname } from 'next/navigation';

/**
 * Fades + slides the page content up on every route change. The `key` forces a
 * remount when the pathname changes, replaying the `.page-enter` CSS animation.
 * Motion is disabled under prefers-reduced-motion (see globals.css).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
