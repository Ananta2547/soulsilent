import { AdminShell } from '@/components/admin/AdminShell';
import { AdminGuard } from '@/components/admin/AdminGuard';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <AdminGuard>{children}</AdminGuard>
    </AdminShell>
  );
}
