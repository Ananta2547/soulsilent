'use client';

/* The invite link of a group booking, shown the moment the seats are secured
 * — on the payment page once paid, or in the booking popup for a free group.
 * The same link is always reachable again from the workshop page. */
import { useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';

export function InviteLinkBox({ url }: { url: string }) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked in some in-app browsers — the field is selectable by hand.
      setCopied(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
      <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, textAlign: 'center' }}>
        <b>{tr(lang, 'ลิงก์เชิญเพื่อนในกลุ่ม', 'Invite link for your group')}</b>
        <br />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          <T
            th="ส่งลิงก์นี้ให้เพื่อน — แต่ละคนเข้าสู่ระบบและกรอกใบสมัครของตัวเอง"
            en="Send this to your friends — each one signs in and fills in their own application."
          />
        </span>
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid var(--cream-deep)',
          background: 'var(--cream)',
          borderRadius: 12,
          padding: '10px 12px',
        }}
      >
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 12.5, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }}
        />
        <button type="button" onClick={copy} className="btn btn-teal" style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13 }}>
          {copied ? tr(lang, 'คัดลอกแล้ว', 'Copied') : tr(lang, 'คัดลอก', 'Copy')}
        </button>
      </div>
      <span style={{ fontSize: 12, color: '#8a5a00', background: '#fcefcf', border: '1px solid #f0dfae', borderRadius: 12, padding: '10px 13px', lineHeight: 1.6 }}>
        <T
          th="ใครเปิดลิงก์และกดรับสิทธิ์จะได้ที่นั่งในกลุ่ม จนกว่าจะครบจำนวน — ส่งให้เฉพาะคนในกลุ่ม เปิดดูอีกครั้งได้จากหน้ากิจกรรม"
          en="Whoever opens it and claims takes a seat in the group until they run out — send it only to your group. You can find it again on the workshop page."
        />
      </span>
    </div>
  );
}
