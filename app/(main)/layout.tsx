import { SiteHeader } from '@/components/layout/SiteHeader';
import { PageTransition } from '@/components/design/PageTransition';
import { ScrollReveal } from '@/components/design/ScrollReveal';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ScrollReveal />
      <main>
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
