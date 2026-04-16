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
      return 'Ban dien theo kWh';
    case 'LEASE':
      return 'Thue he thong';
    case 'INSTALLMENT':
      return 'Tra gop';
    case 'HYBRID':
      return 'Mo hinh ket hop';
    case 'SALE':
      return 'Mua dut';
    default:
      return type;
  }
}

function contractStatusLabel(status: string) {
  if (status === 'ACTIVE') {
    return 'Dang hieu luc';
  }

  if (status === 'EXPIRED') {
    return 'Da het han';
  }

  if (status === 'PENDING') {
    return 'Cho kich hoat';
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
    return `${formatCurrency(Number(contract.fixedMonthlyFee || 0))} / thang`;
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
        title: 'Hop dong dang hieu luc',
        value: String(activeCount),
        subtitle: 'Cac dieu khoan hien dang ap dung cho tai san cua ban',
        delta: nextRenewal ? `Moc gan nhat ${formatDate(nextRenewal)}` : 'Chua co moc gia han',
        trend: 'up',
      },
      {
        title: 'Mo hinh dich vu',
        value: contracts[0] ? contractTypeLabel(contracts[0].type) : 'Chua co du lieu',
        subtitle: 'Hinh thuc thuong mai hien tai cua danh muc',
        delta: contracts[0]?.servicePackage?.name || 'Chua gan goi dich vu',
        trend: 'neutral',
      },
    ];
  }, [contracts]);

  if (loading) {
    return (
      <SectionCard title="Hop dong" eyebrow="Dieu khoan thuong mai">
        <p className={cn('text-sm', bodyText)}>Dang tai hop dong...</p>
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
                            ? 'Dang hoat dong'
                            : contractStatusLabel(contract.status)
                        }
                      />
                      <StatusPill label={contractTypeLabel(contract.type)} />
                    </div>
                    <p className={cn('mt-3 text-sm leading-6', bodyText)}>
                      Hop dong nay dieu phoi cau truc gia dien, thoi han cam ket va trach nhiem van hanh cho he thong dang trien khai.
                    </p>
                  </div>

                  {contract.contractFileUrl ? (
                    <Link
                      href={contract.contractFileUrl}
                      target="_blank"
                      className="btn-secondary-light inline-flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Mo tep hop dong
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>

                <div className={cn('grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3', bodyText)}>
                  <p>Thoi han: {contract.termMonths ? `${contract.termMonths} thang` : '-'}</p>
                  <p>Ngay bat dau: {formatDate(contract.startDate)}</p>
                  <p>Ngay ket thuc: {formatDate(contract.endDate)}</p>
                  <p>Don gia ap dung: {priceSummary(contract)}</p>
                  <p>Goi dich vu: {contract.servicePackage?.name || '-'}</p>
                  <p>VAT cau hinh: {contract.vatRate != null ? `${contract.vatRate}%` : '-'}</p>
                </div>

                <div className="customer-soft-card p-5">
                  <div className={cn('grid gap-3 text-sm sm:grid-cols-2', bodyText)}>
                    <p>He thong ap dung: {contract.solarSystem?.name || '-'}</p>
                    <p>Vi tri lap dat: {contract.solarSystem?.location || '-'}</p>
                    <p>Ma tai san: {contract.solarSystem?.systemCode || '-'}</p>
                    <p>
                      Cong suat:{' '}
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
          <SectionCard title="Hop dong" eyebrow="Dieu khoan thuong mai">
            <div className="customer-soft-card p-5">
              <p className={cn('text-base font-semibold', headingText)}>
                Chua co hop dong nao duoc gan cho tai khoan nay
              </p>
              <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                Khi doi ngu van hanh hoan tat onboarding, hop dong va tep dinh kem se xuat hien tai day.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
