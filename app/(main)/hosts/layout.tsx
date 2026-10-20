import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'ผู้จัดกิจกรรม',
  description: 'รู้จักผู้จัด (Host) ที่ออกแบบกิจกรรมเรียนรู้นอกห้องเรียนบน AllSoulLearn พร้อมผลงานและกิจกรรมของแต่ละคน',
  alternates: { canonical: '/hosts' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
