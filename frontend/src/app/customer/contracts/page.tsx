'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import { listMyContractsRequest } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { ContractRecord, StatCardItem } from '@/types';

function contractTypeLabel(type: string) {
  switch (type) {
    case 'PPA_KWH':
      return 'Bán điện theo kWh';
    case 'LEASE':
      return 'Thuê hệ thống';
    case 'INSTALLMENT':
      return 'Trả góp';
    case 'HYBRID':
      return 'Mô hình kết hợp';
    case 'SALE':
      return 'Mua đứt';
    default:
      return type;
  }
}

function contractStatusLabel(status: string) {
  if (status === 'ACTIVE') {
    return 'Đang hiệu lực';
  }

  if (status === 'EXPIRED') {
    return 'Đã hết hạn';
  }

  if (status === 'PENDING') {
    return 'Chờ kích hoạt';
  }

  return status;
}

function priceSummary(contract: ContractRecord) {
  if (contract.type === 'PPA_KWH') {
    return `${formatCurrency(Number(contract.pricePerKwh || contract.servicePackage?.pricePerKwh || 0))} / kWh`;
  }

  if (contract.type === 'HYBRID') {
    return `${formatCurrency(Number(contract.fixedMonthlyFee || 0))} + ${formatCurrency(Number(contract.pricePerKwh || 0))} / kWh`;
  }

  if (contract.type === 'INSTALLMENT') {
    return `${formatCurrency(Number(contract.fixedMonthlyFee || 0))} / tháng`;
  }

  return formatCurrency(
    Number(contract.fixedMonthlyFee || contract.servicePackage?.fixedMonthlyFee || 0),
  );
}

export default function CustomerContractsPage() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const headingText = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-slate-300' : 'text-slate-600';
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyContractsRequest()
      .then((data) => setContracts(data))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo<StatCardItem[]>(() => {
    const activeCount = contracts.filter((contract) => contract.status === 'ACTIVE').length;
    const nextRenewal = contracts
      .map((contract) => contract.endDate)
      .filter(Boolean)
      .sort()[0];

    return [
      {
        title: 'Hợp đồng đang hiệu lực',
        value: String(activeCount),
        subtitle: 'Các điều khoản hiện đang áp dụng cho tài sản của bạn',
        delta: nextRenewal ? `Mốc gần nhất ${formatDate(nextRenewal)}` : 'Chưa có mốc gia hạn',
        trend: 'up',
      },
      {
        title: 'Mô hình dịch vụ',
        value: contracts[0] ? contractTypeLabel(contracts[0].type) : 'Chưa có dữ liệu',
        subtitle: 'Hình thức thương mại hiện tại của danh mục',
        delta: contracts[0]?.servicePackage?.name || 'Chưa gắn gói dịch vụ',
        trend: 'neutral',
      },
    ];
  }, [contracts]);

  if (loading) {
    return (
      <SectionCard title="Hợp đồng" eyebrow="Điều khoản thương mại">
        <p className={cn('text-sm', bodyText)}>Đang tải hợp đồng...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid gap-5">
        {contracts.length ? (
          contracts.map((contract) => (
            <SectionCard
              key={contract.id}
              title={contract.contractNumber}
              eyebrow={contractTypeLabel(contract.type)}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill
                        label={
                          contract.status === 'ACTIVE'
                            ? 'Đang hoạt động'
                            : contractStatusLabel(contract.status)
                        }
                      />
                      <StatusPill label={contractTypeLabel(contract.type)} />
                    </div>
                    <p className={cn('mt-3 text-sm leading-6', bodyText)}>
                      Hợp đồng này điều phối cấu trúc giá điện, thời hạn cam kết và trách nhiệm vận hành cho hệ thống đang triển khai.
                    </p>
                  </div>

                  {contract.contractFileUrl ? (
                    <Link
                      href={contract.contractFileUrl}
                      target="_blank"
                      className="btn-secondary-light inline-flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Mở tệp hợp đồng
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>

                <div className={cn('grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3', bodyText)}>
                  <p>Thời hạn: {contract.termMonths ? `${contract.termMonths} tháng` : '-'}</p>
                  <p>Ngày bắt đầu: {formatDate(contract.startDate)}</p>
                  <p>Ngày kết thúc: {formatDate(contract.endDate)}</p>
                  <p>Đơn giá áp dụng: {priceSummary(contract)}</p>
                  <p>Gói dịch vụ: {contract.servicePackage?.name || '-'}</p>
                  <p>VAT cấu hình: {contract.vatRate != null ? `${contract.vatRate}%` : '-'}</p>
                </div>

                <div className="customer-soft-card p-5">
                  <div className={cn('grid gap-3 text-sm sm:grid-cols-2', bodyText)}>
                    <p>Hệ thống áp dụng: {contract.solarSystem?.name || '-'}</p>
                    <p>Vị trí lắp đặt: {contract.solarSystem?.location || '-'}</p>
                    <p>Mã tài sản: {contract.solarSystem?.systemCode || '-'}</p>
                    <p>
                      Công suất:{' '}
                      {contract.solarSystem?.capacityKwp
                        ? `${contract.solarSystem.capacityKwp} kWp`
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          ))
        ) : (
          <SectionCard title="Hợp đồng" eyebrow="Điều khoản thương mại">
            <div className="customer-soft-card p-5">
              <p className={cn('text-base font-semibold', headingText)}>
                Chưa có hợp đồng nào được gắn cho tài khoản này
              </p>
              <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                Khi đội ngũ vận hành hoàn tất onboarding, hợp đồng và tệp đính kèm sẽ xuất hiện tại đây.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
