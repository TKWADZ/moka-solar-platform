'use client';

import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/section-card';
import { customerDashboardRequest } from '@/lib/api';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { CustomerDashboardData } from '@/types';

function formatMeterReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

export default function CustomerMetersPage() {
  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    customerDashboardRequest()
      .then(setDashboard)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải lịch sử chỉ số điện.',
        ),
      );
  }, []);

  if (!dashboard) {
    return (
      <SectionCard title="Lịch sử chỉ số điện" eyebrow="Tổng hợp theo từng kỳ" dark>
        <p className={error ? 'text-sm text-rose-300' : 'text-sm text-slate-300'}>
          {error || 'Đang tải lịch sử chỉ số...'}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Lịch sử chỉ số điện"
      eyebrow="Chỉ số, điện tiêu thụ tính tiền, sản lượng và thanh toán theo kỳ"
      dark
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/8 text-sm text-slate-200">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Kỳ</th>
              <th className="px-3 py-3">Chỉ số cũ</th>
              <th className="px-3 py-3">Chỉ số mới</th>
              <th className="px-3 py-3">Điện tiêu thụ</th>
              <th className="px-3 py-3">Điện tạo ra</th>
              <th className="px-3 py-3">Số tiền</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3">Cập nhật</th>
              <th className="px-3 py-3">Nguồn dữ liệu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {dashboard.meterHistory.map((period) => (
              <tr key={period.period} className="align-top">
                <td className="px-3 py-4 font-semibold text-white">{period.period}</td>
                <td className="px-3 py-4">{formatMeterReading(period.previousReading)}</td>
                <td className="px-3 py-4">{formatMeterReading(period.currentReading)}</td>
                <td className="px-3 py-4">
                  {period.loadConsumedKwh != null
                    ? formatNumber(period.loadConsumedKwh, 'kWh')
                    : 'Chưa cập nhật'}
                </td>
                <td className="px-3 py-4">{formatNumber(period.pvGenerationKwh, 'kWh')}</td>
                <td className="px-3 py-4">{formatCurrency(period.amount)}</td>
                <td className="px-3 py-4">{period.paymentStatus}</td>
                <td className="px-3 py-4">
                  {period.updatedAt ? formatDateTime(period.updatedAt) : 'Chưa cập nhật'}
                </td>
                <td className="px-3 py-4">{period.sourceLabel || 'Đang cập nhật'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
