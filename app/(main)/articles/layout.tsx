import type { Metadata } from 'next';

// The page is a client component; its search and share text lives here.
export const metadata: Metadata = {
  title: 'บทความ',
  description: 'บทความ เรื่องเล่า และแรงบันดาลใจจากกิจกรรมเรียนรู้นอกห้องเรียนของ AllSoulLearn',
  alternates: { canonical: '/articles' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
