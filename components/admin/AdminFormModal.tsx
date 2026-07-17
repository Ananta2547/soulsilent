'use client';

import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  /** Optional smaller text below the title (e.g. entity name being edited). */
  subtitle?: string;
  /** Called when user clicks outside, hits Esc, or clicks the ✕. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * Wide, scrollable modal for admin forms. The body scrolls, the header stays
 * pinned. Tailwind utility classes keep this consistent with admin styling.
 */
export function AdminFormModal({ open, title, subtitle, onClose, children }: Props) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-dark/55 backdrop-blur-sm"
      style={{ animation: 'fadeIn .2s ease' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[92vh] bg-paper rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'popIn .3s cubic-bezier(.2,.7,.2,1)' }}
      >
        {/* Header (sticky) */}
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-gray-lighter bg-paper">
          <div className="min-w-0">
            <h2 className="font-heading text-xl sm:text-2xl text-dark truncate">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray mt-0.5 truncate" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-9 h-9 rounded-full bg-surface hover:bg-gray-lighter text-dark flex items-center justify-center transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
