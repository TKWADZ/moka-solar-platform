'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  Bot,
  FileClock,
  KeyRound,
  LifeBuoy,
  Wallet,
} from 'lucide-react';
import { EnergyChart } from '@/components/energy-chart';
import { RevenueChart } from '@/components/revenue-chart';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { adminDashboardRequest, aiAssistantStatusRequest } from '@/lib/api';
import { cn, formatCompactCurrency, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { AdminDashboardData, AiAssistantStatus, StatCardItem } from '@/types';

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<AiAssistantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminDashboardRequest()
      .then((data) => setDashboard(data))
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải dữ liệu dashboard quản trị.',
        ),
      )
      .finally(() => setLoading(false));

    aiAssistantStatusRequest()
      .then((data) => setAssistantStatus(data))
      .catch(() => {
        setAssistantStatus(null);
      });
  }, []);

  const summaryCards = useMemo<StatCardItem[]>(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        title: 'Tổng khách hàng',
        value: formatNumber(dashboard.summary.totalCustomers),
        subtitle: 'Khách hàng đang được theo dõi và xuất hóa đơn',
        delta: '+14 trong quý này',
        trend: 'up',
      },
      {
        title: 'Công suất đã triển khai',
        value: formatNumber(dashboard.summary.totalCapacityKwp, 'kWp'),
        subtitle: 'Danh mục điện mặt trời đang vận hành',
        delta: '+62,8 kWp',
        trend: 'up',
      },
      {
        title: 'Doanh thu tháng',
        value: formatCurrency(dashboard.summary.monthlyRevenue),
        subtitle: 'Giá trị ghi nhận trong chu kỳ hiện tại',
        delta: '+11,6%',
        trend: 'up',
      },
      {
        title: 'Tỷ lệ đúng hạn',
        value: `${dashboard.summary.onTimeRate.toFixed(1)}%`,
        subtitle: 'Tỷ lệ thanh toán trước ngày đến hạn',
        delta: '+3,2 điểm',
        trend: 'up',
      },
    ];
  }, [dashboard]);

  const priorityItems = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        icon: Wallet,
        label: 'Công nợ cần xử lý',
        value: `${dashboard.summary.overdueInvoices} hóa đơn quá hạn`,
        description: 'Ưu tiên đối soát và nhắc thanh toán các hồ sơ sắp vượt SLA.',
      },
      {
        icon: LifeBuoy,
        label: 'Ticket hỗ trợ',
        value: `${dashboard.ticketSummary.open + dashboard.ticketSummary.inProgress} yêu cầu đang mở`,
        description: 'Bao gồm sự cố kỹ thuật, ticket billing và yêu cầu từ khách hàng.',
      },
      {
        icon: FileClock,
        label: 'Nhịp thu tiền',
        value: `${dashboard.summary.unpaidInvoices} hóa đơn chưa hoàn tất`,
        description: 'Theo sát các hóa đơn vừa phát hành để giữ tỷ lệ đúng hạn ở mức cao.',
      },
    ];
  }, [dashboard]);

  if (loading) {
    return (
      <SectionCard title="Dashboard quản trị" eyebrow="Điều hành trực tiếp" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu điều hành...</p>
      </SectionCard>
    );
  }

  if (!dashboard) {
    return (
      <SectionCard title="Dashboard quản trị" eyebrow="Điều hành trực tiếp" dark>
        <p className="text-sm text-rose-300">{error || 'Không thể tải dữ liệu dashboard quản trị.'}</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)] xl:gap-5">
        <RevenueChart data={dashboard.revenueTrend} title="Doanh thu theo tháng" dark />

        <div className="grid gap-4 xl:gap-5">
          <SectionCard title="Nhịp vận hành hôm nay" eyebrow="Tài chính và vận hành" dark>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">MRR ước tính</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  {formatCompactCurrency(dashboard.summary.monthlyRevenue)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Doanh thu định kỳ từ danh mục đang hoạt động</p>
              </div>

              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Doanh thu năm</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  {formatCompactCurrency(dashboard.summary.yearlyRevenue)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Hiệu suất kinh doanh tích lũy toàn danh mục</p>
              </div>

              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ticket đang mở</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{dashboard.summary.openTickets}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Cần phối hợp kỹ thuật, billing và chăm sóc khách hàng</p>
              </div>

              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Thanh toán đúng hạn</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-emerald-200">
                  {dashboard.summary.onTimeRate.toFixed(1)}%
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Chỉ số sức khỏe dòng tiền của toàn bộ hệ thống</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="ChatGPT cho vận hành" eyebrow="Cấu hình AI nội bộ" dark>
            <div className="portal-card-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Trạng thái</p>
                  <p className="mt-3 text-xl font-semibold tracking-tight text-white">
                    {assistantStatus?.configured ? 'Sẵn sàng sử dụng' : 'Chưa cấu hình API key'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {assistantStatus?.configured
                      ? `Model ${assistantStatus.model}`
                      : 'Thêm API key trong admin để dùng ChatGPT cho CMS, ticket và tóm tắt dashboard.'}
                  </p>
                </div>

                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl border',
                    assistantStatus?.configured
                      ? 'border-emerald-300/15 bg-emerald-400/10 text-emerald-100'
                      : 'border-amber-300/15 bg-amber-400/10 text-amber-100',
                  )}
                >
                  {assistantStatus?.configured ? (
                    <Bot className="h-5 w-5" />
                  ) : (
                    <KeyRound className="h-5 w-5" />
                  )}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Nguồn cấu hình</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {assistantStatus?.source === 'database'
                      ? 'Lưu trong admin'
                      : assistantStatus?.source === 'env'
                        ? 'Biến môi trường'
                        : 'Chưa thiết lập'}
                  </p>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Cập nhật gần nhất</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {assistantStatus?.updatedAt ? formatDateTime(assistantStatus.updatedAt) : 'Chưa có lịch sử'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/admin/ai" className="btn-primary inline-flex">
                  Mở cấu hình ChatGPT
                </Link>
                <Link
                  href="/admin/ai"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Dùng trợ lý ngay
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Ưu tiên cần theo sát" eyebrow="Cảnh báo vận hành" dark>
            <div className="space-y-3">
              {priorityItems.map((item) => (
                <div key={item.label} className="portal-card-soft flex items-start gap-4 p-4">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-200">
                    <item.icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-sm text-amber-100">{item.value}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] xl:gap-5">
        <EnergyChart data={dashboard.energyTrend} title="Sản lượng danh mục so với phụ tải" dark />

        <SectionCard title="Chỉ số dịch vụ" eyebrow="SLA và trải nghiệm khách hàng" dark>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="portal-card-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ticket mới</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{dashboard.ticketSummary.open}</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-300" />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Nên phân tuyến trong ngày để không dồn backlog.</p>
            </div>

            <div className="portal-card-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Đang xử lý</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{dashboard.ticketSummary.inProgress}</p>
                </div>
                <LifeBuoy className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Theo sát các case kỹ thuật và billing có tác động tiền mặt.</p>
            </div>

            <div className="portal-card-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Đã giải quyết</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{dashboard.ticketSummary.resolved}</p>
                </div>
                <BadgePercent className="h-5 w-5 text-emerald-300" />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Giữ nhịp đóng việc ổn định để cải thiện trải nghiệm hậu mãi.</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Dữ liệu vận hành" eyebrow="Manual-first / semi-auto" dark>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3">
            {(dashboard.operationalOverview || []).length ? (
              (dashboard.operationalOverview || []).map((item) => (
                <div key={item.systemId} className="portal-card-soft flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.systemCode}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{item.systemName}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.customerName}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {item.latestPeriod || 'Chưa có kỳ dữ liệu'} • {item.latestSourceLabel || 'Đang cập nhật'} •{' '}
                      {item.latestUpdatedAt ? formatDateTime(item.latestUpdatedAt) : 'Chưa có lần cập nhật'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                      item.freshness.code === 'READY'
                        ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                        : item.freshness.code === 'STALE'
                          ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                          : 'border-white/10 bg-white/[0.06] text-slate-200',
                    )}
                  >
                    {item.freshness.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="portal-card-soft p-4 text-sm text-slate-300">
                Chưa có dữ liệu vận hành gần đây để hiển thị trên dashboard.
              </div>
            )}
          </div>

          <div className="portal-card-soft p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Tổng quan</p>
            <div className="mt-4 grid gap-3">
              <div>
                <p className="text-xs text-slate-400">Đã cập nhật</p>
                <p className="mt-1 text-lg font-semibold text-emerald-200">{dashboard.summary.operationalReadySystems || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Cần cập nhật</p>
                <p className="mt-1 text-lg font-semibold text-amber-200">{dashboard.summary.operationalStaleSystems || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Chưa có kỳ</p>
                <p className="mt-1 text-lg font-semibold text-white">{dashboard.summary.operationalMissingSystems || 0}</p>
              </div>
            </div>
            <Link href="/admin/operations-data" className="btn-primary mt-5 inline-flex w-full justify-center">
              Mở quản lý dữ liệu
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Khách hàng ưu tiên" eyebrow="Danh sách cần theo dõi" dark>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.topCustomers.map((customer) => (
            <div key={customer.customerId} className="portal-card-soft p-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Khách hàng</p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-white">
                {customer.companyName || 'Khách hàng chưa đặt tên'}
              </p>
              <div className="mt-5 grid gap-3">
                <div>
                  <p className="text-xs text-slate-400">Đã xuất hóa đơn</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {formatCurrency(customer.totalBilled)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Số dư chưa thanh toán</p>
                  <p className="mt-1 text-lg font-semibold text-amber-200">
                    {formatCurrency(customer.unpaidBalance)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
