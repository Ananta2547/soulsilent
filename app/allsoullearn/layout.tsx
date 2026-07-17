import { AllsoullearnHeader } from '@/components/layout/AllsoullearnHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';

export default function AllsoullearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AllsoullearnHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
