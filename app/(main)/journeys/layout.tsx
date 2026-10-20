import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'กิจกรรมทั้งหมด',
  description: 'รวมเวิร์กช็อป แคมป์ และกิจกรรมเรียนรู้นอกห้องเรียนที่เปิดรับสมัคร เลือกตามวัน หมวด หรือสถานที่ แล้วจองที่นั่งออนไลน์ได้ทันที',
  alternates: { canonical: '/journeys' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
