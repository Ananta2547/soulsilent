import type { Metadata } from 'next';
import './globals.css';
import { LangProvider } from '@/lib/i18n';
import { RouteTransition } from '@/components/design/RouteTransition';

export const metadata: Metadata = {
  title: 'soulsilent · learn outside the room',
  description: 'Workshop · Camp · Organize — เรียนรู้นอกห้องเรียน',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased" data-scroll-behavior="smooth">
      <head>
        <meta name="theme-color" content="#0d8a7e" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700&family=Mitr:wght@300;400;500;600&family=IBM+Plex+Sans+Thai:wght@300;400;500;600&family=Caveat:wght@500;700&family=Poppins:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">
        <LangProvider>{children}</LangProvider>
        <RouteTransition />
      </body>
    </html>
  );
}
