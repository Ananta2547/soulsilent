import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { getCurrentUserWithRoles } from '@/lib/auth';
import './admin.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Checked on the server so a visitor never gets the dashboard shell. Every
  // /api/admin route still checks the role itself; this is not the only lock.
  const user = await getCurrentUserWithRoles();
  if (!user) redirect('/auth/login?redirect=/admin');
  if (user.role !== 'admin') redirect('/');

  return (
    <AdminShell>
      <AdminGuard>{children}</AdminGuard>
    </AdminShell>
  );
}
