import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'ปฏิทินกิจกรรม',
  description: 'ดูกิจกรรมเรียนรู้นอกห้องเรียนที่กำลังจะมาถึงแบบปฏิทิน เลือกวันที่สะดวกแล้วจองได้ทันที',
  alternates: { canonical: '/calendar' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
