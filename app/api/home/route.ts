import { NextResponse } from 'next/server';
import { loadHomeBundle } from '@/lib/home-bundle';

/** GET /api/home — everything the home page shows, in one response (one D1
 *  batch, see lib/home-bundle). The home page itself now reads the same
 *  bundle on the server; this route stays for clients that refresh it. */
export async function GET() {
  try {
    return NextResponse.json(await loadHomeBundle());
  } catch (error) {
    console.error('Home bundle error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
