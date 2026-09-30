'use client';

/* The AAR survey now lives as a tab on the check-in page (design "Teacher
 * Check-in v2"). This address stays so older links keep working. */

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { PageLoader } from '@/components/design/PageLoader';

export default function TeacherSurveyRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const underSessions = usePathname().startsWith('/host/sessions/');
  useEffect(() => {
    router.replace(`${underSessions ? `/host/sessions/round/${id}` : `/host/journeys/${id}`}?tab=aar`);
  }, [router, id, underSessions]);
  return (
    <div className="flex items-center justify-center h-40">
      <PageLoader />
    </div>
  );
}
