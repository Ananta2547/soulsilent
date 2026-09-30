'use client';

/* The receiving end of a group booking. A friend arrives with nothing but the
 * link, so this page says what they are joining, gets them signed in, and
 * takes their application — the seat itself is already paid for by whoever
 * booked the group. Mirrors /claim/[token] (gift + transfer). */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { BookingModal, type BookingResult } from '@/components/workshops/BookingModal';
import { fmtDate } from '@/lib/datetime';
import { getWorkshopDays } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

type Info = {
  invite: {
    from_name: string | null;
    tier_label: string | null;
    slots: number;
    claimed: number;
    left: number;
    status: 'open' | 'full' | 'cancelled';
  };
  workshop: Workshop;
  claimable: boolean;
  unpaid: boolean;
  isBooker: boolean;
  isMember: boolean;
  signedIn: boolean;
  error?: string;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { lang } = useLang();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a claim so the link's new state (one seat fewer) is read back.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/${token}`);
        const data = (await res.json()) as Info;
        if (cancelled) return;
        if (!res.ok) setError(data.error || tr(lang, 'ลิงก์นี้ใช้ไม่ได้', 'This link is not valid'));
        else setInfo(data);
      } catch {
        if (!cancelled) setError(tr(lang, 'โหลดข้อมูลไม่สำเร็จ', 'Failed to load'));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, lang, reloadKey]);

  async function claim(application: unknown): Promise<BookingResult> {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invites/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application }),
      });
      const data = (await res.json()) as { claimed?: boolean; error?: string };
      setSubmitting(false);
      if (!res.ok || !data.claimed) {
        return { error: data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
      }
      // Same success popup the booking flow ends on — nothing is owed here.
      return { submitted: true, mode: 'free' };
    } catch {
      setSubmitting(false);
      return { error: tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
    }
  }

  if (loading) return null;

  if (error || !info) {
    return (
      <Shell>
        <h1 className="display-th" style={{ fontSize: 26, margin: '0 0 10px' }}>
          {tr(lang, 'ลิงก์นี้ใช้ไม่ได้', 'This link is not valid')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 24px' }}>
          {error || tr(lang, 'ลิงก์อาจถูกใช้ครบแล้วหรือถูกยกเลิก', 'It may already be used up, or cancelled.')}
        </p>
        <Btn kind="teal" href="/journeys">
          {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse journeys')}
        </Btn>
      </Shell>
    );
  }

  const { workshop, invite } = info;
  const days = getWorkshopDays(workshop);
  const inviteHref = `/invite/${token}`;

  // Everything that stops the claim, in the order the friend would meet it.
  const blocked: string | null =
    invite.status === 'cancelled'
      ? tr(lang, 'การจองกลุ่มนี้ถูกยกเลิกแล้ว', 'This group booking was cancelled.')
      : info.unpaid
        ? tr(lang, 'กลุ่มนี้ยังชำระเงินไม่สำเร็จ จึงยังรับสิทธิ์ไม่ได้', 'This group has not been paid for yet.')
        : info.isBooker
          ? tr(
              lang,
              'คุณเป็นผู้จองกลุ่มนี้เอง — ส่งลิงก์ให้เพื่อนเพื่อกดรับสิทธิ์',
              'You booked this group — pass the link to your friends.',
            )
          : info.isMember
            ? tr(lang, 'คุณมีที่นั่งของกิจกรรมนี้อยู่แล้ว', 'You already have a seat in this journey.')
            : invite.status === 'full'
              ? tr(lang, 'ลิงก์นี้ถูกใช้ครบตามจำนวนแล้ว', 'Every seat on this link has been taken.')
              : !info.claimable
                ? tr(lang, 'กิจกรรมนี้ปิดรับแล้ว จึงไม่สามารถรับสิทธิ์ได้', 'This journey is closed, so the seat cannot be claimed.')
                : null;

  return (
    <>
      <Shell>
        <span className="mono" style={{ fontSize: 11, color: 'var(--teal)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
          {tr(lang, 'คำเชิญเข้ากลุ่ม', 'Invitation to a group')}
        </span>
        <h1 className="display-th" style={{ fontSize: 'clamp(26px,4vw,34px)', margin: '10px 0 6px', lineHeight: 1.25 }}>
          {workshop.title}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 22px' }}>
          {invite.from_name
            ? tr(
                lang,
                `${invite.from_name} จองกิจกรรมนี้เป็นกลุ่มและชวนคุณเข้าร่วม — ที่นั่งชำระเงินเรียบร้อยแล้ว เหลือเพียงกรอกใบสมัครของคุณเอง`,
                `${invite.from_name} booked this journey for a group and is inviting you — the seat is already paid for. All that is left is your own application.`,
              )
            : tr(
                lang,
                'ที่นั่งในกลุ่มนี้ชำระเงินเรียบร้อยแล้ว เหลือเพียงกรอกใบสมัครของคุณเอง',
                'This seat is already paid for. All that is left is your own application.',
              )}
        </p>

        <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-deep)', borderRadius: 16, padding: '16px 18px', marginBottom: 24 }}>
          <Fact
            label={tr(lang, 'วันที่', 'Date')}
            value={`${fmtDate(days[0], lang, 'long')}${days.length > 1 ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`) : ''}`}
          />
          <Fact label={tr(lang, 'เวลา', 'Time')} value={`${workshop.time_start}–${workshop.time_end}`} />
          <Fact
            label={tr(lang, 'สถานที่', 'Where')}
            value={workshop.is_online ? tr(lang, 'ออนไลน์', 'Online') : workshop.location || '—'}
          />
          {invite.tier_label && <Fact label={tr(lang, 'แบบ', 'Type')} value={invite.tier_label} />}
          <Fact
            label={tr(lang, 'ที่นั่ง', 'Seats')}
            value={tr(lang, `รับสิทธิ์แล้ว ${invite.claimed}/${invite.slots} · เหลือ ${invite.left}`, `${invite.claimed}/${invite.slots} taken · ${invite.left} left`)}
          />
        </div>

        {blocked ? (
          <>
            <div style={{ background: '#fdeceb', border: '1px solid #f3c9c5', color: '#b3261e', borderRadius: 14, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              {blocked}
            </div>
            <Btn kind="teal" href={`/journeys/${workshop.id}`}>
              {tr(lang, 'ดูรายละเอียดกิจกรรม', 'View the journey')}
            </Btn>
          </>
        ) : info.signedIn ? (
          <Btn kind="teal" onClick={() => setFormOpen(true)}>
            {tr(lang, 'รับสิทธิ์และกรอกใบสมัคร', 'Claim and fill in the form')} <span className="mono">→</span>
          </Btn>
        ) : (
          // Signing in is not optional: the seat has to end up on an account, and
          // the application is filled from that account's own profile.
          <div>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 12px' }}>
              <T
                th="เข้าสู่ระบบหรือสมัครสมาชิกก่อน แล้วระบบจะพากลับมาที่หน้านี้เพื่อรับสิทธิ์"
                en="Sign in or create an account — you will come straight back here to claim."
              />
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/auth/login?redirect=${encodeURIComponent(inviteHref)}`} className="btn btn-teal" style={{ justifyContent: 'center', padding: '14px 22px' }}>
                {tr(lang, 'เข้าสู่ระบบ', 'Sign in')} <span className="mono">→</span>
              </Link>
              <Link href={`/auth/register?redirect=${encodeURIComponent(inviteHref)}`} className="btn" style={{ justifyContent: 'center', background: 'var(--cream)', color: 'var(--ink)', padding: '14px 22px' }}>
                {tr(lang, 'สมัครสมาชิก', 'Create an account')}
              </Link>
            </div>
          </div>
        )}
      </Shell>

      {formOpen && (
        <BookingModal
          mode="claim"
          workshop={workshop}
          submitting={submitting}
          tierLabel={invite.tier_label}
          onClose={() => {
            setFormOpen(false);
            // Re-read: a successful claim takes a seat off the link, which is
            // what this page should show if they come back to it.
            setReloadKey((k) => k + 1);
          }}
          onSubmit={claim}
        />
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section style={{ maxWidth: 640, margin: '0 auto', padding: '90px 24px 80px' }}>{children}</section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 14, padding: '5px 0' }}>
      <span className="mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: 72 }}>
        {label}
      </span>
      <span style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
