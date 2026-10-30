import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LangProvider } from '@/lib/i18n';
import { DataLoadingProvider, DataLoadingScreen } from '@/components/design/DataLoading';
import { PwaRegister } from '@/components/pwa/PwaRegister';
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  // Pages set their own title; the template adds the brand after it.
  title: { default: 'AllSoulLearn · เรียนรู้นอกห้องเรียน', template: '%s · AllSoulLearn' },
  description: SITE_DESCRIPTION,
  applicationName: 'AllSoulLearn',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'th_TH',
    title: 'AllSoulLearn · เรียนรู้นอกห้องเรียน',
    description: SITE_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE, width: 512, height: 512, alt: 'AllSoulLearn' }],
  },
  twitter: { card: 'summary_large_image' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0C8577',
  // Draw under the notch/home bar; padding comes from env(safe-area-inset-*).
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700&family=Mitr:wght@300;400;500;600&family=IBM+Plex+Sans+Thai:wght@300;400;500;600&family=Caveat:wght@500;700&family=Poppins:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">
        <DataLoadingProvider>
          <LangProvider>{children}</LangProvider>
          <DataLoadingScreen />
        </DataLoadingProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
