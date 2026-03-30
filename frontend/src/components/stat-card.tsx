'use client';

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function StatCard({
  title,
  value,
  subtitle,
  delta,
  trend = 'neutral',
  dark = false,
  valueClassName,
}: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: string;
  trend?: 'up' | 'down' | 'neutral';
  dark?: boolean;
  valueClassName?: string;
}) {
  const { tt } = useI18n();
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight;

  return (
    <div className={cn(dark ? 'portal-card min-w-0 p-5 sm:p-6' : 'surface-card min-w-0 p-5 sm:p-6')}>
      <p
        className={cn(
          'text-[11px] uppercase tracking-[0.22em]',
          dark ? 'text-slate-500' : 'text-slate-500',
        )}
      >
        {tt(title)}
      </p>
      <h3
        className={cn(
          'mt-3 break-words text-[1.85rem] font-semibold leading-[0.96] tracking-[-0.04em] sm:mt-4 sm:text-[2.4rem] lg:text-[2.6rem]',
          dark ? 'text-white' : 'text-white',
          valueClassName,
        )}
      >
        {value}
      </h3>
      {subtitle ? (
        <p className={cn('mt-2 max-w-[24rem] text-xs leading-5 sm:text-[13px]', dark ? 'text-slate-400' : 'text-slate-300')}>
          {tt(subtitle)}
        </p>
      ) : null}
      {delta ? (
        <div
          className={cn(
            'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] sm:mt-5',
            dark ? 'bg-white/[0.08] text-slate-200' : 'bg-white/[0.06] text-slate-200',
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {tt(delta)}
        </div>
      ) : null}
    </div>
  );
}
