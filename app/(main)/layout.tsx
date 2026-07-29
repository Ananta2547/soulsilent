import { SiteHeader } from '@/components/layout/SiteHeader';
import { PageTransition } from '@/components/design/PageTransition';
import { ScrollReveal } from '@/components/design/ScrollReveal';
import { MarketingFooter } from '@/components/layout/MarketingFooter';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ScrollReveal />
      <main>
        <PageTransition>{children}</PageTransition>
      </main>
      {/* Global footer — shows on every page in the (main) shell. */}
      <MarketingFooter />
    </>
  );
}
