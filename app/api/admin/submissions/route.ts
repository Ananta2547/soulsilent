import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { routeError, type SubKind } from '@/lib/submissions';
import type { VerificationRow } from '@/lib/verification-labels';

export type AdminVerification = VerificationRow & { account_email: string | null; account_name_user: string | null };

export type AdminSubmission = {
  kind: SubKind;
  id: string;
  title: string;
  review_status: string;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  pending_json: string | null;
  live_status: string;
  date: string | null;
  image_url: string | null;
  host_id: string | null;
  host_name: string | null;
  rounds: number;
  /** Cancelled by the host (hidden); admin may delete it for good. */
  cancelled?: boolean;
  /** Booking rows of any status — a row with history cannot be deleted. */
  bookings?: number;
};

/**
 * GET /api/admin/submissions — host-made activities that are not simply
 * approved: waiting for admin first, then those sent back or turned down —
 * plus hosts asking to be allowed to publish on their own.
 */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT * FROM (
           SELECT 'single' AS kind, w.id, w.title, w.review_status, w.review_note, w.submitted_at, w.reviewed_at, w.pending_json,
                  w.status AS live_status, w.date, w.image_url, w.created_by AS host_id,
                  COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS host_name, 0 AS rounds
             FROM workshops w LEFT JOIN users u ON u.id = w.created_by
            WHERE w.master_id IS NULL AND w.review_status IN ('pending', 'changes_requested', 'rejected') AND w.status != 'cancelled'
           UNION ALL
           SELECT 'round', m.id, m.title, m.review_status, m.review_note, m.submitted_at, m.reviewed_at, m.pending_json,
                  m.activity_status, NULL, m.cover_image_url, m.created_by,
                  COALESCE(NULLIF(TRIM(u.nickname), ''), u.name),
                  (SELECT COUNT(*) FROM workshops r WHERE r.master_id = m.id AND r.status != 'cancelled')
             FROM workshop_masters m LEFT JOIN users u ON u.id = m.created_by
            WHERE m.review_status IN ('pending', 'changes_requested', 'rejected') AND m.activity_status != 'archived'
         )
         ORDER BY CASE review_status WHEN 'pending' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END, submitted_at DESC`,
      )
      .all<AdminSubmission>();
    const list = rows.results || [];
    // Host activities the host cancelled: hidden, kept until admin deletes them.
    const gone =
      (
        await db
          .prepare(
            `SELECT 'single' AS kind, w.id, w.title, w.review_status, w.review_note, w.submitted_at, w.reviewed_at, NULL AS pending_json,
                    w.status AS live_status, w.date, w.image_url, w.created_by AS host_id,
                    COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS host_name, 0 AS rounds,
                    (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id) AS bookings, w.updated_at AS updated_at
               FROM workshops w LEFT JOIN users u ON u.id = w.created_by
              WHERE w.master_id IS NULL AND w.review_status IS NOT NULL AND w.status = 'cancelled'
             UNION ALL
             SELECT 'round', m.id, m.title, m.review_status, m.review_note, m.submitted_at, m.reviewed_at, NULL,
                    m.activity_status, NULL, m.cover_image_url, m.created_by,
                    COALESCE(NULLIF(TRIM(u.nickname), ''), u.name),
                    (SELECT COUNT(*) FROM workshops r WHERE r.master_id = m.id),
                    (SELECT COUNT(*) FROM bookings b JOIN workshops r ON r.id = b.workshop_id WHERE r.master_id = m.id), m.updated_at
               FROM workshop_masters m LEFT JOIN users u ON u.id = m.created_by
              WHERE m.review_status IS NOT NULL AND m.activity_status = 'archived'
             ORDER BY updated_at DESC LIMIT 200`,
          )
          .all<AdminSubmission>()
      ).results || [];
    for (const g of gone) g.cancelled = true;
    // Host forms asking to publish on their own (migration 081), waiting first.
    const ver =
      (
        await db
          .prepare(
          `SELECT v.*, u.email AS account_email, u.name AS account_name_user
               FROM host_verifications v LEFT JOIN users u ON u.id = v.user_id
              WHERE v.status IN ('pending', 'changes_requested', 'rejected')
              ORDER BY CASE v.status WHEN 'pending' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END, v.submitted_at DESC`,
          )
          .all<AdminVerification>()
      ).results || [];
    return NextResponse.json({
      submissions: list,
      cancelled: gone,
      verifications: ver,
      pending: list.filter((r) => r.review_status === 'pending').length + ver.filter((v) => v.status === 'pending').length,
    });
  } catch (e) {
    return routeError(e, 'Admin list submissions');
  }
}
