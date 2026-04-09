'use client';

import { useEffect, useState } from 'react';
import { CustomerSystemCard } from '@/components/customer-system-card';
import { EnergyChart } from '@/components/energy-chart';
import { SectionCard } from '@/components/section-card';
import { useSystemDashboardPresence } from '@/hooks/use-system-dashboard-presence';
import { customerDashboardRequest } from '@/lib/api';
import { CustomerDashboardData } from '@/types';

export default function CustomerSystemsPage() {
  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [error, setError] = useState('');

  useSystemDashboardPresence(
    dashboard?.systems.map((system) => system.id) || [],
    'customer-systems',
  );

  useEffect(() => {
    customerDashboardRequest()
      .then(setDashboard)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải dữ liệu hệ thống điện.',
        ),
      );
  }, []);

  if (!dashboard) {
    return (
      <SectionCard title="Hệ thống điện mặt trời" eyebrow="Tài sản và kỳ dữ liệu đang theo dõi" dark>
        <p className={error ? 'text-sm text-rose-300' : 'text-sm text-slate-300'}>
          {error || 'Đang tải dữ liệu hệ thống điện...'}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Danh sách hệ thống" eyebrow="Tổng hợp theo từng site và nguồn dữ liệu" dark>
        <div className="space-y-4">
          {dashboard.systems.map((system) => (
            <CustomerSystemCard key={system.id} system={system} />
          ))}
        </div>
      </SectionCard>

      <EnergyChart
        data={dashboard.generationTrend}
        title="Sản lượng tổng hợp theo kỳ"
        description="Biểu đồ sử dụng dữ liệu kỳ đã được đối soát. Portal không giả lập số realtime nếu nguồn monitor chưa có dữ liệu thực."
        unit="kWh"
        dark
      />
    </div>
  );
}
