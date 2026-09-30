'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** "หน้าโปรไฟล์ของฉัน" in the teacher dashboard: the public teacher page is
 *  edited in place, so this opens the signed-in teacher's own page with the
 *  editor already on (?edit=1). */
export default function TeacherProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user?: { id?: string } | null }>)
      .then((d) => router.replace(d.user?.id ? `/hosts/${d.user.id}?edit=1` : '/auth/login?redirect=/teacher/profile'))
      .catch(() => router.replace('/host/journeys'));
  }, [router]);
  return <p style={{ padding: 40, color: 'var(--muted)' }}>กำลังเปิดหน้าโปรไฟล์…</p>;
}
