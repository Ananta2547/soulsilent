'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Location } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { safeParseArray, parseMapCoords, coordsToEmbedSrc, isShortMapLink } from '@/lib/workshop-utils';

function buildMap(mapUrl: string | null, address: string) {
  const query = encodeURIComponent(address);
  const addrEmbed = `https://maps.google.com/maps?q=${query}&output=embed`;
  const addrOpen = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (!mapUrl || !mapUrl.trim()) return { embedSrc: addrEmbed, openUrl: addrOpen, shouldResolve: false };

  const iframeMatch = mapUrl.match(/<iframe[^>]*\bsrc=["']([^"']+)["']/i);
  if (iframeMatch) return { embedSrc: iframeMatch[1], openUrl: iframeMatch[1], shouldResolve: false };

  const u = mapUrl.trim();
  if (u.includes('/maps/embed') || u.includes('output=embed')) return { embedSrc: u, openUrl: u, shouldResolve: false };
  const coords = parseMapCoords(u);
  if (coords) return { embedSrc: coordsToEmbedSrc(coords.lat, coords.lng, coords.zoom), openUrl: u, shouldResolve: false };
  if (isShortMapLink(u)) return { embedSrc: addrEmbed, openUrl: u, shouldResolve: true };
  return { embedSrc: addrEmbed, openUrl: u, shouldResolve: false };
}

export function LocationDetail({ location }: { location: Location }) {
  const { lang } = useLang();
  const gallery = useMemo(() => safeParseArray<string>(location.gallery_json, []), [location.gallery_json]);
  const [active, setActive] = useState(0);
  const address = `${location.name}, ${location.subdistrict}, ${location.district}, ${location.province}`;

  const initial = useMemo(() => buildMap(location.map_url, address), [location.map_url, address]);
  const [embedSrc, setEmbedSrc] = useState(initial.embedSrc);

  useEffect(() => {
    if (!initial.shouldResolve || !location.map_url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/maps/resolve?url=${encodeURIComponent(location.map_url!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { finalUrl?: string };
        if (cancelled || !data.finalUrl) return;
        const coords = parseMapCoords(data.finalUrl);
        if (coords) setEmbedSrc(coordsToEmbedSrc(coords.lat, coords.lng, coords.zoom));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.shouldResolve, location.map_url]);

  const cover = gallery[active] || gallery[0] || null;

  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="container" style={{ maxWidth: 980 }}>
        {/* Heading */}
        <Reveal>
          <Link
            href="/workshops"
            className="mono"
            style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none' }}
          >
            ← {tr(lang, 'กลับ', 'Back')}
          </Link>
          <span className="eyebrow" style={{ marginTop: 16, display: 'inline-flex' }}>
            <T th="สถานที่ · รายละเอียด" en="location · details" />
          </span>
          <h1 className="display-th" style={{ fontSize: 'clamp(30px, 4.5vw, 52px)', lineHeight: 1.1, margin: '12px 0 8px' }}>
            {location.name}
          </h1>
          <p style={{ fontSize: 16, color: 'var(--muted)', margin: 0 }}>
            {location.subdistrict} · {location.district} · {location.province}
          </p>
        </Reveal>

        {/* Gallery */}
        {cover && (
          <Reveal variant="reveal-zoom" style={{ marginTop: 28 }}>
            <div style={{ borderRadius: 22, overflow: 'hidden', background: 'var(--cream)', aspectRatio: '16 / 9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt={location.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {gallery.length > 1 && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {gallery.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    style={{
                      width: 84,
                      height: 64,
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: 0,
                      cursor: 'pointer',
                      padding: 0,
                      outline: i === active ? '2px solid var(--teal)' : 'none',
                      outlineOffset: 2,
                      opacity: i === active ? 1 : 0.7,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </Reveal>
        )}

        <div className="grid-x g-articles" style={{ gap: 32, marginTop: 36, alignItems: 'start' }}>
          {/* Left: details + map */}
          <div>
            {location.details && (
              <Reveal>
                <span className="eyebrow">
                  <T th="เกี่ยวกับสถานที่" en="about this place" />
                </span>
                <p style={{ fontSize: 16, color: 'var(--ink-soft)', lineHeight: 1.7, margin: '14px 0 0', whiteSpace: 'pre-wrap' }}>
                  {location.details}
                </p>
              </Reveal>
            )}

            <Reveal style={{ marginTop: location.details ? 36 : 0 }}>
              <span className="eyebrow">
                <T th="แผนที่" en="map" />
              </span>
              <h2 className="display-th" style={{ fontSize: 'clamp(24px, 3vw, 34px)', margin: '12px 0 16px' }}>
                <T th="วิธีมาหาเรา" en="How to find us" />
              </h2>
              <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: 'var(--cream)', aspectRatio: '16 / 10' }}>
                <iframe src={embedSrc} title="Google Maps" loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
                <a href={initial.openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-paper btn-sm" style={{ position: 'absolute', top: 14, right: 14, boxShadow: '0 6px 16px -4px rgba(13,30,29,.25)' }}>
                  Google Maps <span className="mono">↗</span>
                </a>
              </div>
            </Reveal>

            {location.graphic_map_url && (
              <Reveal style={{ marginTop: 28 }}>
                <span className="eyebrow">
                  <T th="แผนที่วาดมือ" en="hand-drawn map" />
                </span>
                <div style={{ borderRadius: 18, overflow: 'hidden', marginTop: 12, background: 'var(--cream)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={location.graphic_map_url} alt="" style={{ width: '100%', display: 'block' }} />
                </div>
              </Reveal>
            )}
          </div>

          {/* Right: info card */}
          <Reveal variant="reveal-right">
            <div className="card card-static card-cream" style={{ position: 'sticky', top: 96 }}>
              <h3 className="display-th" style={{ fontSize: 20, margin: '0 0 16px' }}>
                <T th="ข้อมูลสถานที่" en="Venue info" />
              </h3>

              {location.address_detail && (
                <InfoRow label={tr(lang, 'ที่อยู่สถานที่', 'Street address')} value={location.address_detail} />
              )}
              <InfoRow label={tr(lang, 'พื้นที่', 'Area')} value={address} />
              <InfoRow label={tr(lang, 'ที่จอดรถยนต์', 'Car parking')} value={`${location.car_parking.toLocaleString()} ${tr(lang, 'คัน', 'cars')}`} />
              <InfoRow label={tr(lang, 'ที่จอดมอเตอร์ไซค์', 'Motorcycle parking')} value={`${location.motorcycle_parking.toLocaleString()} ${tr(lang, 'คัน', 'bikes')}`} last />

              <a href={initial.openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
                {tr(lang, 'นำทางด้วย Google Maps', 'Navigate with Google Maps')} <span className="mono">↗</span>
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px dashed var(--cream-deep)',
      }}
    >
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}
