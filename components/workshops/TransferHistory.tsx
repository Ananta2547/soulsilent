'use client';

/* Who handed a seat to whom, for one workshop. Shared by the admin applicants
 * screen and the teacher's workshop screen so both desks read the same rows.
 *
 * One row is one handover, laid out as sender → receiver. The receiver side
 * stays empty until somebody actually claims: a link that was created is not
 * yet a seat that moved, and a name there would say it had. */
import { useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { sqliteToMs } from '@/lib/datetime';

export type TransferRow = {
  id: string;
  booking_id: string;
  kind: 'gift' | 'transfer';
  status: 'pending' | 'claimed' | 'cancelled';
  created_at: string;
  claimed_at: string | null;
  from_name: string | null;
  from_phone: string | null;
  to_name: string | null;
  to_phone: string | null;
  from_email: string | null;
  to_email: string | null;
};

export function TransferHistory({ workshopId }: { workshopId: string }) {
  const { lang } = useLang();
  const [rows, setRows] = useState<TransferRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workshops/${workshopId}/transfers`);
        const data = (await res.json()) as { transfers?: TransferRow[] };
        if (!cancelled) setRows(data.transfers || []);
      } catch (e) {
        console.error('Failed to load transfers', e);
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  // A workshop with no handovers shows nothing at all — an empty table would be
  // noise on the many workshops where nobody gifts a seat.
  if (!rows || rows.length === 0) return null;

  const fmt = (v: string | null) => {
    if (!v) return '—';
    const ms = sqliteToMs(v);
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="display-th" style={{ fontSize: 18, margin: '0 0 4px' }}>
        {tr(lang, 'ประวัติการโอนย้ายสิทธิ์', 'Seat handovers')}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
        {tr(
          lang,
          'ที่นั่งที่ถูกส่งเป็นของขวัญหรือโอนให้คนอื่น — ฝั่งซ้ายคือเจ้าของเดิม ฝั่งขวาคือผู้รับ',
          'Seats sent as a gift or passed on — the original holder on the left, the receiver on the right.',
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => {
          const claimed = r.status === 'claimed';
          return (
            <div
              key={r.id}
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--cream-deep)',
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 999,
                    padding: '3px 9px',
                    color: r.kind === 'gift' ? '#8a5a00' : 'var(--teal-deep)',
                    background: r.kind === 'gift' ? '#fcefcf' : 'var(--teal-50)',
                  }}
                >
                  {r.kind === 'gift' ? tr(lang, 'ของขวัญ', 'Gift') : tr(lang, 'โอนสิทธิ์', 'Transfer')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {tr(lang, 'สร้างลิงก์', 'Link created')} {fmt(r.created_at)}
                  {claimed ? ` · ${tr(lang, 'รับสิทธิ์', 'Claimed')} ${fmt(r.claimed_at)}` : ''}
                </span>
              </div>

              <div className="tf-parties">
                <Party label={tr(lang, 'ผู้โอน', 'From')} name={r.from_name} phone={r.from_phone} email={r.from_email} />
                <span aria-hidden className="tf-arrow">
                  →
                </span>
                {claimed ? (
                  <Party label={tr(lang, 'ผู้รับ', 'To')} name={r.to_name} phone={r.to_phone} email={r.to_email} />
                ) : (
                  // Not claimed yet. A gift buyer named someone, so that name is
                  // shown as the intent — greyed, because nothing has moved.
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                      {tr(lang, 'ผู้รับ', 'To')}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--muted)', fontStyle: 'italic' }}>
                      {tr(lang, 'รอผู้รับสิทธิ์', 'Awaiting the receiver')}
                    </div>
                    {r.to_name && (
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                        {tr(lang, 'ตั้งใจส่งให้', 'Intended for')} {r.to_name}
                        {r.to_phone ? ` · ${r.to_phone}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .tf-parties {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }
        .tf-arrow {
          color: var(--muted);
          font-size: 16px;
          padding-top: 16px;
          flex-shrink: 0;
        }
        /* On a phone the two sides stack; the arrow turns downward so the
           direction of the handover still reads. */
        @media (max-width: 560px) {
          .tf-parties {
            flex-direction: column;
            gap: 8px;
          }
          .tf-arrow {
            padding-top: 0;
            transform: rotate(90deg);
          }
        }
      `}</style>
    </section>
  );
}

function Party({
  label,
  name,
  phone,
  email,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{name || '—'}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {phone || '—'}
        {email ? ` · ${email}` : ''}
      </div>
    </div>
  );
}
