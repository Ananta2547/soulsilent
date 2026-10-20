import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ไม่พบหน้านี้',
  robots: { index: false },
};

/** Any URL that matches no page. Rendered inside the root layout only (no
 *  site header), so it carries its own way back. */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <div className="mono" style={{ fontSize: 13, letterSpacing: '.12em', color: 'var(--teal)', marginBottom: 14 }}>
          404
        </div>
        <h1 className="display-th" style={{ fontSize: 30, lineHeight: 1.3, margin: '0 0 12px', color: 'var(--ink)' }}>
          ไม่พบหน้านี้
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--muted)', margin: '0 0 28px' }}>
          ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว ลองกลับไปหน้าแรก หรือดูกิจกรรมที่เปิดรับอยู่
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{ padding: '12px 22px', borderRadius: 999, background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}
          >
            กลับหน้าแรก
          </Link>
          <Link
            href="/journeys"
            style={{ padding: '12px 22px', borderRadius: 999, border: '1.5px solid var(--ink)', color: 'var(--ink)', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}
          >
            ดูกิจกรรมทั้งหมด
          </Link>
        </div>
      </div>
    </main>
  );
}
