import type { Metadata } from 'next';
import { cache } from 'react';
import { getDB } from '@/lib/db';
import { absoluteUrl, metaText, SITE_NAME } from '@/lib/seo';
import { PUBLIC_STATUSES } from '@/lib/workshop-public';

/* Search and share data for one journey. The page itself is a client
   component, so its title, description, share card and Event structured data
   are produced here on the server from the same row. */

type Row = {
  id: string;
  title: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  date: string;
  end_date: string | null;
  time_start: string;
  time_end: string;
  price: number;
  status: string;
  is_online: number;
  loc_name: string | null;
  loc_province: string | null;
  loc_district: string | null;
};

/** One read per request, shared by generateMetadata and the layout. */
const loadJourney = cache(async (id: string): Promise<Row | null> => {
  try {
    const db = await getDB();
    const statuses = PUBLIC_STATUSES.map((s) => `'${s}'`).join(', ');
    return await db
      .prepare(
        `SELECT w.id, w.title, w.short_description, w.description, w.image_url, w.date, w.end_date,
                w.time_start, w.time_end, w.price, w.status, w.is_online,
                l.name AS loc_name, l.province AS loc_province, l.district AS loc_district
           FROM workshops w LEFT JOIN locations l ON l.id = w.location_id
          WHERE w.id = ? AND w.status IN (${statuses})`
      )
      .bind(id)
      .first<Row>();
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const w = await loadJourney(id);
  if (!w) return { title: 'กิจกรรม', robots: { index: false } };
  const description = metaText(w.short_description || w.description) || `${w.title} บน ${SITE_NAME}`;
  const images = w.image_url ? [{ url: absoluteUrl(w.image_url), alt: w.title }] : undefined;
  return {
    title: w.title,
    description,
    alternates: { canonical: `/journeys/${w.id}` },
    openGraph: { type: 'website', title: w.title, description, url: `/journeys/${w.id}`, images },
    twitter: { card: 'summary_large_image', title: w.title, description, images: images?.map((i) => i.url) },
  };
}

/** Thai wall-clock date + "HH:MM" → ISO 8601 with the +07:00 offset. */
function thaiIso(date: string, time: string): string {
  return `${date}T${(time || '00:00').slice(0, 5)}:00+07:00`;
}

export default async function JourneyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const w = await loadJourney(id);
  const ld = w && {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: w.title,
    description: metaText(w.short_description || w.description, 500) || undefined,
    image: w.image_url ? [absoluteUrl(w.image_url)] : undefined,
    startDate: thaiIso(w.date, w.time_start),
    endDate: thaiIso(w.end_date || w.date, w.time_end),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: w.is_online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: w.is_online
      ? { '@type': 'VirtualLocation', url: absoluteUrl(`/journeys/${w.id}`) }
      : {
          '@type': 'Place',
          name: w.loc_name || w.loc_province || 'ประเทศไทย',
          address: {
            '@type': 'PostalAddress',
            addressLocality: w.loc_district || undefined,
            addressRegion: w.loc_province || undefined,
            addressCountry: 'TH',
          },
        },
    organizer: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    offers: {
      '@type': 'Offer',
      price: w.price || 0,
      priceCurrency: 'THB',
      url: absoluteUrl(`/journeys/${w.id}`),
      availability: w.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    },
  };
  return (
    <>
      {ld && (
        <script
          type="application/ld+json"
          // `<` escaped so a title can never close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }}
        />
      )}
      {children}
    </>
  );
}
