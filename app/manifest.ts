import type { MetadataRoute } from 'next';

/**
 * Web app manifest — what makes the site installable as an app (PWA).
 * Icons are rendered from the triangle "A" mark in app/icon.svg and live in
 * public/icons/. The service worker is public/sw.js, registered by
 * components/pwa/PwaRegister.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AllSoulLearn',
    short_name: 'AllSoulLearn',
    description: 'จองกิจกรรมและ Journey การเรียนรู้นอกห้องเรียน เก็บการจองและ Diary ไว้ในมือถือ',
    lang: 'th',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F1E6',
    theme_color: '#0C8577',
    categories: ['education', 'lifestyle', 'travel'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon (Android; iOS ignores these).
    shortcuts: [
      {
        name: 'การจองของฉัน',
        short_name: 'การจอง',
        url: '/me/bookings?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-ticket.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Diary / My Journey',
        short_name: 'Diary',
        url: '/me/journey?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-diary.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'ปฏิทินกิจกรรม',
        short_name: 'ปฏิทิน',
        url: '/calendar?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-calendar.png', sizes: '96x96', type: 'image/png' }],
      },
    ],
  };
}
