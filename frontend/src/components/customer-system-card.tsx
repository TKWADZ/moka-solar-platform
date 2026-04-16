'use client';

import Link from 'next/link';
import { AlertCircle, ChevronRight, DatabaseZap, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatDateTime, formatMonthPeriod, formatNumber } from '@/lib/utils';
import {
  CustomerSystemMonitor,
  DeviceRecord,
  MonitorSnapshot,
  MonthlyEnergyRecordRecord,
  MonthlyPvBillingRecord,
} from '@/types';
import { StatusPill } from './status-pill';

export function asMonitorSnapshot(
  value: MonitorSnapshot | Record<string, unknown> | null | undefined,
) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MonitorSnapshot)
    : null;
}

export function normalizePowerKw(value?: number | null) {
  return typeof value === 'number' ? Math.abs(value) : null;
}

export function shortenSiteId(value?: string | null) {
  if (!value) {
    return '-';
  }

  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

export function formatMonitorStatusLabel(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();

  if (!normalized) {
    return 'Đang cập nhật';
  }

  if (normalized.includes('ONLINE') || normalized.includes('TRUC_TUYEN')) {
    return 'Trực tuyến';
  }

  if (normalized.includes('OVERDUE')) {
    return 'Cần xử lý';
  }

  return value || 'Đang cập nhật';
}

function formatProviderLabel(value?: string | null) {
  if (value === 'SOLARMAN') return 'SOLARMAN';
  if (value === 'SEMS_PORTAL') return 'SEMS Portal';
  if (value === 'DEYE') return 'Deye OpenAPI';
  return value || 'Nhập tay / CSV';
}

function pickPrimaryDevice(system: CustomerSystemMonitor) {
  return (
    system.devices?.find((device) => (device.deviceType || '').toUpperCase().includes('INVERTER')) ||
    system.devices?.[0] ||
    null
  );
}

function pickLatestMonthlyEnergy(system: CustomerSystemMonitor) {
  return system.monthlyEnergyRecords?.[0] || null;
}

function pickLatestMonthlyBilling(system: CustomerSystemMonitor) {
  return system.monthlyPvBillings?.[0] || null;
}

function formatMonthlyPeriod(
  energyRecord: MonthlyEnergyRecordRecord | null,
  billingRecord: MonthlyPvBillingRecord | null,
) {
  if (billingRecord) {
    return formatMonthPeriod(billingRecord.month, billingRecord.year);
  }

  if (energyRecord) {
    return formatMonthPeriod(energyRecord.month, energyRecord.year);
  }

  return '-';
}

function formatDeviceName(
  system: CustomerSystemMonitor,
  snapshot: MonitorSnapshot | null,
  primaryDevice: DeviceRecord | null,
) {
  return (
    snapshot?.deviceModel ||
    primaryDevice?.productId ||
    [system.inverterBrand, system.inverterModel].filter(Boolean).join(' ') ||
    primaryDevice?.deviceType ||
    '-'
  );
}

function formatDeviceCode(snapshot: MonitorSnapshot | null, primaryDevice: DeviceRecord | null) {
  return snapshot?.inverterSerial || snapshot?.deviceId || primaryDevice?.deviceSn || '-';
}

export function CustomerSystemCard({
  system,
  actionHref = '/customer/systems',
  actionLabel = 'Xem chi tiết',
}: {
  system: CustomerSystemMonitor;
  actionHref?: string;
  actionLabel?: string;
}) {
  const snapshot = asMonitorSnapshot(system.latestMonitorSnapshot);
  const primaryDevice = pickPrimaryDevice(system);
  const latestMonthlyEnergy = pickLatestMonthlyEnergy(system);
  const latestMonthlyBilling = pickLatestMonthlyBilling(system);
  const latestOperationalData = system.latestOperationalData || null;
  const monthlyPeriod = formatMonthlyPeriod(latestMonthlyEnergy, latestMonthlyBilling);
  const latestSync =
    latestOperationalData?.lastUpdatedAt ||
    system.lastMonthlySyncAt ||
    system.latestMonthlySyncTime ||
    system.lastBillingSyncAt ||
    null;
  const latestConsumption =
    latestMonthlyEnergy?.loadConsumedKwh ?? null;
  const latestMeterReading =
    latestMonthlyEnergy?.meterReadingEnd != null ? latestMonthlyEnergy.meterReadingEnd : null;
  const hasOperationalData = Boolean(latestMonthlyEnergy || latestMonthlyBilling);

  const detailRows = [
    { label: 'Công suất hệ thống', value: formatNumber(system.capacityKwp, 'kWp') },
    { label: 'Nguồn dữ liệu', value: formatProviderLabel(system.monitoringProvider) },
    {
      label: 'Site / station ID',
      value: shortenSiteId(system.stationId || system.monitoringPlantId || snapshot?.plantId),
    },
    {
      label: 'Kỳ dữ liệu gần nhất',
      value: latestOperationalData?.period || monthlyPeriod,
    },
    {
      label: 'Trạng thái dữ liệu',
      value: latestOperationalData?.freshness?.label || 'Đang cập nhật',
    },
    {
      label: 'Lần cập nhật cuối',
      value: latestSync ? formatDateTime(latestSync) : 'Chưa cập nhật',
    },
    {
      label: 'Inverter',
      value: formatDeviceName(system, snapshot, primaryDevice),
    },
    {
      label: 'Serial / mã thiết bị',
      value: formatDeviceCode(snapshot, primaryDevice),
    },
    {
      label: 'Thiết bị đã ghép',
      value: String(system.devices?.length || 0),
    },
    {
      label: 'Điện tạo ra kỳ gần nhất',
      value:
        latestMonthlyEnergy?.pvGenerationKwh != null
          ? `${formatNumber(latestMonthlyEnergy.pvGenerationKwh, 'kWh')} (${monthlyPeriod})`
          : 'Chưa cập nhật',
    },
    {
      label: 'Điện tiêu thụ kỳ gần nhất',
      value:
        latestConsumption != null
          ? `${formatNumber(latestConsumption, 'kWh')} (${monthlyPeriod})`
          : 'Chưa cập nhật',
    },
    {
      label: 'Chỉ số mới nhất',
      value:
        latestMeterReading != null
          ? `${latestMeterReading.toLocaleString('vi-VN')} (${monthlyPeriod})`
          : 'Chưa áp dụng đo chỉ số',
    },
    {
      label: 'Tiền kỳ gần nhất',
      value:
        latestMonthlyBilling?.totalAmount != null
          ? `${formatCurrency(latestMonthlyBilling.totalAmount)} (${monthlyPeriod})`
          : 'Chưa phát sinh billing',
    },
  ];

  return (
    <div className="customer-soft-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{system.systemCode}</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
            {system.name}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill label={system.status === 'ACTIVE' ? 'Đang hoạt động' : system.status} />
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
              <DatabaseZap className="h-3.5 w-3.5" />
              {latestOperationalData?.sourceLabel || formatProviderLabel(system.monitoringProvider)}
            </span>
          </div>
        </div>

        <Link
          href={actionHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto sm:justify-start sm:py-2"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {detailRows.map((item) => (
          <div
            key={item.label}
            className="customer-soft-card-muted px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{item.value}</p>
          </div>
        ))}
      </div>

      <div
        className={`mt-5 flex items-start gap-3 rounded-[20px] border px-4 py-4 text-sm ${
          hasOperationalData
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}
      >
        {hasOperationalData ? (
          <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {hasOperationalData ? 'Dữ liệu vận hành đã sẵn sàng' : 'Đang chờ kỳ dữ liệu mới'}
          </p>
          <p className="mt-1 text-sm leading-6">
            {hasOperationalData
              ? 'Portal đang hiển thị dữ liệu kỳ/tháng đã được đối soát. Hệ thống không giả lập số realtime nếu nguồn monitor chưa sẵn sàng.'
              : 'Hệ thống đã được gắn monitor/source, nhưng portal sẽ chỉ hiển thị sau khi có kỳ dữ liệu hợp lệ.'}
          </p>
        </div>
      </div>
    </div>
  );
}
