import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LangProvider } from '@/lib/i18n';
import { DataLoadingProvider, DataLoadingScreen } from '@/components/design/DataLoading';
import { PwaRegister } from '@/components/pwa/PwaRegister';
import { APPLE_SPLASH } from '@/components/pwa/splash';

export const metadata: Metadata = {
  title: 'AllSoulLearn · learn outside the room',
  description: 'Workshop · Camp · Organize — เรียนรู้นอกห้องเรียน',
  applicationName: 'AllSoulLearn',
  // Installed on iPhone/iPad (Add to Home Screen): full screen, own icon/title.
  appleWebApp: { capable: true, title: 'AllSoulLearn', statusBarStyle: 'default', startupImage: APPLE_SPLASH },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0C8577',
  // Lets the installed app draw under the notch/home bar; padding comes from
  // env(safe-area-inset-*) where it matters.
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
