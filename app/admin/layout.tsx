import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminGuard } from '@/components/admin/AdminGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 bg-surface">
        <div className="p-6 lg:p-8">
          <AdminGuard>{children}</AdminGuard>
        </div>
      </div>
    </div>
  );
}
