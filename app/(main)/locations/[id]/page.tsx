import { notFound } from 'next/navigation';
import { getDB } from '@/lib/db';
import type { Location } from '@/lib/types';
import { LocationDetail } from './LocationDetail';

async function getLocation(id: string): Promise<Location | null> {
  try {
    const db = await getDB();
    return await db.prepare('SELECT * FROM locations WHERE id = ?').bind(id).first<Location>();
  } catch {
    return null;
  }
}

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getLocation(id);
  if (!location) notFound();
  return <LocationDetail location={location} />;
}
