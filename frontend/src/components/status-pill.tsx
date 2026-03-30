'use client';

import { useI18n } from '@/lib/i18n';
import { cn, statusTone } from '@/lib/utils';

const statusLabelMap: Record<string, string> = {
  PAID: 'Đã thanh toán',
  Paid: 'Đã thanh toán',
  ISSUED: 'Chờ thanh toán',
  Issued: 'Chờ thanh toán',
  PARTIAL: 'Thanh toán một phần',
  Partial: 'Thanh toán một phần',
  OVERDUE: 'Quá hạn',
  Overdue: 'Quá hạn',
  CANCELLED: 'Đã hủy',
  UNBILLED: 'Chưa xuất hóa đơn',
  Success: 'Thành công',
  SUCCESS: 'Thành công',
  Pending: 'Đang xử lý',
  PENDING: 'Đang xử lý',
  Failed: 'Thất bại',
  FAILED: 'Thất bại',
  Open: 'Mới',
  OPEN: 'Mới',
  'In Progress': 'Đang xử lý',
  IN_PROGRESS: 'Đang xử lý',
  Resolved: 'Đã giải quyết',
  RESOLVED: 'Đã giải quyết',
  Closed: 'Đã đóng',
  CLOSED: 'Đã đóng',
  Active: 'Đang hoạt động',
  Healthy: 'Ổn định',
  Attention: 'Cần chú ý',
};

export function StatusPill({ label, tone: toneOverride }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'default' }) {
  const { tt } = useI18n();
  const tone = toneOverride ?? statusTone(label);
  const displayLabel = statusLabelMap[label] || statusLabelMap[label.toUpperCase()] || tt(label);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap',
        tone === 'success' && 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/20',
        tone === 'warning' && 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/20',
        tone === 'danger' && 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/20',
        tone === 'default' && 'bg-white/10 text-slate-200 ring-1 ring-white/10',
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
