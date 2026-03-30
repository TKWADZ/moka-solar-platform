import { PortalShell } from '@/components/portal-shell';
import { adminNav } from '@/data/mock';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      title="Trung tâm điều hành"
      kicker="Vận hành doanh nghiệp năng lượng"
      nav={adminNav}
      allowedRoles={['SUPER_ADMIN', 'ADMIN', 'STAFF']}
    >
      {children}
    </PortalShell>
  );
}
