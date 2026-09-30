import Link from 'next/link';
import type { Workshop } from '@/lib/types';

export function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const spotsLeft = workshop.max_participants;

  return (
    <Link href={`/journeys/${workshop.id}`} className="card group block">
      {workshop.image_url ? (
        <div className="aspect-[297/420] rounded-xl overflow-hidden mb-4 bg-surface">
          <img
            src={workshop.image_url}
            alt={workshop.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="aspect-[297/420] rounded-xl mb-4 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <svg className="w-12 h-12 text-primary/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <span className="badge-primary">{workshop.status === 'active' ? 'เปิดรับ' : workshop.status}</span>
        {workshop.location && (
          <span className="text-xs text-gray flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {workshop.location}
          </span>
        )}
      </div>

      <h3 className="font-heading text-lg text-dark group-hover:text-primary transition-colors line-clamp-2">
        {workshop.title}
      </h3>

      {workshop.short_description && (
        <p className="text-sm text-gray mt-1 line-clamp-2">{workshop.short_description}</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-lighter">
        <div className="text-sm text-gray">
          <span className="font-medium text-dark">
            {new Date(workshop.date).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <span className="mx-1.5">·</span>
          <span>{workshop.time_start} - {workshop.time_end}</span>
        </div>
        <span className="font-heading text-lg text-primary font-medium">
          {workshop.payment_type === 'free' || workshop.price <= 0 ? 'ฟรี' : `฿${workshop.price.toLocaleString()}`}
        </span>
      </div>
    </Link>
  );
}
