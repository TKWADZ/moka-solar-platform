import { CustomerThemeProvider } from '@/components/customer-theme-provider';
import { PortalShell } from '@/components/portal-shell';
import { customerNav } from '@/data/mock';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerThemeProvider>
      <PortalShell
        title="Cổng khách hàng"
        kicker="Sản lượng, hóa đơn và hỗ trợ vận hành"
        nav={customerNav}
        allowedRoles={['CUSTOMER']}
      >
        {children}
      </PortalShell>
    </CustomerThemeProvider>
  );
}
