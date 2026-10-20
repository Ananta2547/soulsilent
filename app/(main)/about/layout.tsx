import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'เกี่ยวกับเรา',
  description: 'AllSoulLearn คือพื้นที่เรียนรู้นอกห้องเรียน ที่เชื่อว่าทุกคนเรียนรู้ได้อย่างปลอดภัย เป็นธรรม และเป็นตัวเอง',
  alternates: { canonical: '/about' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
