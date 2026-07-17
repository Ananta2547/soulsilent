'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type ElementType } from 'react';

export function useReveal(opts: { threshold?: number; rootMargin?: string } = {}) {
  // Extract to primitives so deps don't change every render even when caller
  // passes a fresh `{ threshold: 0.4 }` literal each time.
  const threshold = opts.threshold ?? 0.15;
  const rootMargin = opts.rootMargin ?? '0px 0px -8% 0px';
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold, rootMargin }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return [ref, visible] as const;
}

type RevealProps = {
  as?: ElementType;
  variant?: 'reveal' | 'reveal-left' | 'reveal-right' | 'reveal-zoom';
  delay?: number;
  draw?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

export function Reveal({
  as: Tag = 'div',
  variant = 'reveal',
  delay = 0,
  draw = false,
  children,
  className = '',
  style,
  ...rest
}: RevealProps) {
  const [ref, visible] = useReveal();
  const cn = [variant, visible ? 'in' : '', draw && visible ? 'draw-in' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag
      ref={ref}
      className={cn}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
