import { notFound } from 'next/navigation';
import { getDB } from '@/lib/db';
import type { Portfolio } from '@/lib/types';
import type { PortfolioDoc } from '@/lib/portfolio-builder';
import { PublicCanvas } from '@/components/portfolio/builder/PublicCanvas';
import { ResponsiveStage } from '@/components/portfolio/ResponsiveStage';
import { CANVAS_W } from '@/lib/portfolio-builder';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { BackButton } from '@/components/portfolio/BackButton';

async function getPortfolio(id: string) {
  try {
    const db = await getDB();
    const portfolio = await db
      .prepare('SELECT * FROM portfolios WHERE id = ? AND published = 1')
      .bind(id)
      .first<Portfolio>();
    if (!portfolio) return null;
    return { portfolio };
  } catch {
    return null;
  }
}

export default async function PublicPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPortfolio(id);
  if (!data) notFound();

  const { portfolio } = data;

  let doc: PortfolioDoc | null = null;
  try {
    if (portfolio.doc_json) doc = JSON.parse(portfolio.doc_json) as PortfolioDoc;
  } catch {}

  if (!doc) notFound();

  return (
    <>
      <SiteHeader />
      <main style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        <ResponsiveStage contentWidth={CANVAS_W} contentHeight={doc.canvasH || 1700}>
          <PublicCanvas doc={doc} />
        </ResponsiveStage>
        <BackButton />
      </main>
    </>
  );
}
