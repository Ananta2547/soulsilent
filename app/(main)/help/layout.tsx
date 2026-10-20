import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'ศูนย์ช่วยเหลือ',
  description: 'คำถามที่พบบ่อยเรื่องการจอง การชำระเงิน การยกเลิกและคืนเงิน การโอนสิทธิ์ และการเข้าร่วมกิจกรรม',
  alternates: { canonical: '/help' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
