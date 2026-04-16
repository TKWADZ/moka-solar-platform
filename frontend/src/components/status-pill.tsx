'use client';

import { useCustomerTheme } from '@/components/customer-theme-provider';
import { useI18n } from '@/lib/i18n';
import { cn, statusTone } from '@/lib/utils';

const statusLabelMap: Record<string, string> = {
  PAID: 'Da thanh toan',
  Paid: 'Da thanh toan',
  ISSUED: 'Cho thanh toan',
  Issued: 'Cho thanh toan',
  PARTIAL: 'Thanh toan mot phan',
  Partial: 'Thanh toan mot phan',
  OVERDUE: 'Qua han',
  Overdue: 'Qua han',
  CANCELLED: 'Da huy',
  PENDING_REVIEW: 'Cho duyet',
  ESTIMATE: 'Tam tinh',
  DRAFT: 'Ban nhap',
  UNBILLED: 'Chua xuat hoa don',
  Success: 'Thanh cong',
  SUCCESS: 'Thanh cong',
  Pending: 'Dang xu ly',
  PENDING: 'Dang xu ly',
  Failed: 'That bai',
  FAILED: 'That bai',
  Open: 'Moi',
  OPEN: 'Moi',
  'In Progress': 'Dang xu ly',
  IN_PROGRESS: 'Dang xu ly',
  Resolved: 'Da giai quyet',
  RESOLVED: 'Da giai quyet',
  Closed: 'Da dong',
  CLOSED: 'Da dong',
  Active: 'Dang hoat dong',
  Healthy: 'On dinh',
  Attention: 'Can chu y',
  SYNCED: 'Da sync',
  RETRYING: 'Dang retry',
  ERROR: 'Loi du lieu',
  MANUAL_OVERRIDE: 'Override tay',
  OK: 'Du lieu ok',
  INCOMPLETE: 'Thieu du lieu',
  UNSTABLE_SOURCE: 'Nguon can review',
};

export function StatusPill({
  label,
  tone: toneOverride,
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'default';
}) {
  const { tt } = useI18n();
  const { enabled, theme } = useCustomerTheme();
  const customerDark = enabled && theme === 'dark';
  const customerLight = enabled && theme !== 'dark';
  const tone = toneOverride ?? statusTone(label);
  const displayLabel =
    statusLabelMap[label] || statusLabelMap[label.toUpperCase()] || tt(label);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap',
        tone === 'success' &&
          (customerLight
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/20'),
        tone === 'warning' &&
          (customerLight
            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            : 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/20'),
        tone === 'danger' &&
          (customerLight
            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
            : 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/20'),
        tone === 'default' &&
          (customerLight
            ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
            : customerDark
              ? 'bg-white/10 text-slate-200 ring-1 ring-white/10'
              : 'bg-white/10 text-slate-200 ring-1 ring-white/10'),
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          tone === 'success' && 'bg-emerald-300',
          tone === 'warning' && 'bg-amber-300',
          tone === 'danger' && 'bg-rose-300',
          tone === 'default' && 'bg-slate-300',
        )}
      />
      {displayLabel}
    </span>
  );
}
