'use client';

import { type ReactNode } from 'react';
import { AdminSheet } from './AdminShell';

type Props = {
  open: boolean;
  title: string;
  /** Optional smaller text below the title (e.g. entity name being edited). */
  subtitle?: string;
  /** Called when user clicks outside, hits Esc, or clicks the ✕. */
  onClose: () => void;
  children: ReactNode;
  /** Small label above the title; the Host Dashboard passes its own. */
  eyebrow?: string;
};

/**
 * Wide, scrollable modal for admin forms — the "Admin Dashboard v3" sheet:
 * cream header that stays pinned, scrolling body, a bottom sheet on phones.
 * Each <fieldset>/<legend> inside becomes a numbered section (admin.css).
 */
export function AdminFormModal({ open, title, subtitle, onClose, children, eyebrow = 'admin' }: Props) {
  return (
    <AdminSheet open={open} onClose={onClose} eyebrow={eyebrow} title={title} sub={subtitle} width={880}>
      <div className="adm-form">{children}</div>
    </AdminSheet>
  );
}
