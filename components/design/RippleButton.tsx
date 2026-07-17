'use client';

import { useRef, type CSSProperties, type ReactNode, type MouseEvent } from 'react';

type Kind = 'teal' | 'ink' | 'paper' | 'ghost';

type Props = {
  kind?: Kind;
  size?: 'sm';
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  href?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function Btn({
  kind = 'teal',
  size,
  children,
  onClick,
  href,
  type = 'button',
  disabled,
  className = '',
  style,
  title,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const cls = `btn btn-${kind}${size === 'sm' ? ' btn-sm' : ''} ${className}`.trim();

  function handlePress(e: MouseEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX ?? r.left + r.width / 2) - r.left;
    const y = (e.clientY ?? r.top + r.height / 2) - r.top;
    el.style.setProperty('--mx', x + 'px');
    el.style.setProperty('--my', y + 'px');
    const span = document.createElement('span');
    span.className = 'ripple';
    const dim = Math.max(r.width, r.height);
    span.style.width = span.style.height = dim + 'px';
    span.style.left = x - dim / 2 + 'px';
    span.style.top = y - dim / 2 + 'px';
    el.appendChild(span);
    setTimeout(() => span.remove(), 600);
    onClick?.(e);
  }

  if (href) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={cls}
        onClick={handlePress}
        style={style}
        title={title}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      className={cls}
      onClick={handlePress}
      disabled={disabled}
      style={style}
      title={title}
    >
      {children}
    </button>
  );
}
