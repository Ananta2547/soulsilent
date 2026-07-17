import { NextResponse } from 'next/server';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { uploadToR2 } from '@/lib/r2';

// Folders any signed-in user may write to (their own profile/portfolio assets).
// Everything else (workshop/course/article/location) stays admin-only.
const USER_WRITABLE_PREFIXES = ['images/avatar/', 'images/portfolio/'];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const key = formData.get('key') as string;

    if (!file || !key) {
      return NextResponse.json({ error: 'Missing file or key' }, { status: 400 });
    }

    // Authorize by destination: profile folders allow any logged-in user;
    // all other folders require admin.
    const isUserFolder = USER_WRITABLE_PREFIXES.some((p) => key.startsWith(p));
    if (isUserFolder) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
      }
    } else {
      await requireAdmin();
    }

    const buffer = await file.arrayBuffer();
    await uploadToR2(key, buffer, file.type);

    return NextResponse.json({ key, url: `/api/media/${key}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Unauthorized' || message === 'Forbidden') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
