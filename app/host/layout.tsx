import { redirect } from 'next/navigation';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { HostGate } from './_components/HostGate';

// Checked on the server so a visitor never gets the dashboard shell. HostGate
// keeps its client check, and every /api/teacher route checks the role itself.
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserWithRoles();
  if (!user) redirect('/auth/login?redirect=/host');
  if (!hasAnyRole(user.roles, ['teacher'])) redirect('/');
  return <HostGate>{children}</HostGate>;
}
