'use client';

/* The link that hands a seat to somebody else. One link per seat: it is minted
 * once and reused, so reopening this shows the same URL rather than a second
 * live link for one seat. */
import { useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';

export function TransferLinkModal({
  url,
  kind,
  recipient,
  onClose,
  invite,
}: {
  url: string;
  kind: 'gift' | 'transfer' | 'invite';
  /** Who the buyer said the gift was for. Absent for a plain transfer. */
  recipient?: string | null;
  /** Invite links: seats for friends, and how many are already taken. */
  invite?: { slots: number; claimed: number };
  onClose: () => void;
}) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some in-app browsers — the field is selectable,
      // so the link is still reachable by hand.
      setCopied(false);
    }
  }

  const isGift = kind === 'gift';
  const isInvite = kind === 'invite';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr(lang, 'ปิด', 'Close')}
          style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 0, fontSize: 22, lineHeight: 1, color: 'var(--muted)', cursor: 'pointer' }}
        >
          ×
        </button>

        <div className="mono" style={{ fontSize: 11, color: 'var(--teal)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          {isInvite ? tr(lang, 'ลิงก์เชิญเพื่อน', 'Invite link') : isGift ? tr(lang, 'ลิงก์ของขวัญ', 'Gift link') : tr(lang, 'ลิงก์โอนสิทธิ์', 'Transfer link')}
        </div>
        <h3 className="display-th" style={{ fontSize: 22, margin: '0 0 10px', lineHeight: 1.3 }}>
          {isInvite
            ? tr(lang, 'ส่งลิงก์นี้ให้เพื่อนในกลุ่ม', 'Send this link to your group')
            : isGift
              ? tr(lang, 'ส่งลิงก์นี้ให้ผู้รับ', 'Send this link to the recipient')
              : tr(lang, 'ส่งลิงก์นี้ให้เพื่อน', 'Send this link to your friend')}
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
          {isInvite && invite
            ? tr(
                lang,
                `เพื่อนแต่ละคนเข้าสู่ระบบและกรอกใบสมัครของตัวเอง — รับสิทธิ์แล้ว ${invite.claimed}/${invite.slots} คน${invite.claimed >= invite.slots ? ' ลิงก์ใช้ครบแล้ว' : ''}`,
                `Each friend signs in and fills in their own application — ${invite.claimed}/${invite.slots} claimed${invite.claimed >= invite.slots ? ', the link is used up' : ''}.`,
              )
            : recipient
            ? tr(
                lang,
                `สำหรับ ${recipient} — ผู้รับต้องเข้าสู่ระบบและกรอกใบสมัครของตัวเองก่อน สิทธิ์จึงจะย้าย`,
                `For ${recipient} — they sign in and fill in their own application before the seat moves.`,
              )
            : tr(
                lang,
                'ผู้รับต้องเข้าสู่ระบบและกรอกใบสมัครของตัวเอง เมื่อยืนยันแล้วที่นั่งจะเป็นของผู้รับทันที',
                'They sign in and fill in their own application. Once confirmed, the seat is theirs.',
              )}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--cream-deep)',
            background: 'var(--cream)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 13, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }}
          />
          <button type="button" onClick={copy} className="btn btn-teal" style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13 }}>
            {copied ? tr(lang, 'คัดลอกแล้ว', 'Copied') : tr(lang, 'คัดลอก', 'Copy')}
          </button>
        </div>

        <div style={{ background: '#fcefcf', border: '1px solid #f0dfae', borderRadius: 12, padding: '11px 14px', fontSize: 12.5, color: '#8a5a00', lineHeight: 1.6 }}>
          {isInvite ? (
            <T
              th="ใครก็ตามที่เปิดลิงก์และกดรับสิทธิ์จะได้ที่นั่งในกลุ่มไป จนกว่าจะครบจำนวน — ส่งให้เฉพาะคนในกลุ่มเท่านั้น ลิงก์ใช้ได้จนถึงเวลาเริ่มรอบ"
              en="Whoever opens the link and claims takes a seat in the group until they run out — send it only to your group. It works until the round starts."
            />
          ) : (
            <T
              th="ลิงก์นี้ใช้ได้ครั้งเดียว — ใครก็ตามที่เปิดลิงก์และกดรับสิทธิ์จะได้ที่นั่งนี้ไป ส่งให้เฉพาะคนที่ตั้งใจเท่านั้น"
              en="This link works once — whoever opens it and claims takes the seat. Send it only to the person you mean to."
            />
          )}
        </div>

      </div>
    </div>
  );
}
