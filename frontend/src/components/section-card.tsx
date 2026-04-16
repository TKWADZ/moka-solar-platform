'use client';

import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function SectionCard({
  title,
  eyebrow,
  children,
  dark = false,
  className,
  bodyClassName,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const { tt } = useI18n();

  return (
    <div
      className={cn(
        dark ? 'portal-card min-w-0 p-5 sm:p-6' : 'customer-surface-card min-w-0 p-5 sm:p-6',
        className,
      )}
    >
      {eyebrow ? (
        <p className={cn('text-[11px] uppercase tracking-[0.22em]', dark ? 'text-slate-500' : 'text-slate-400')}>
          {tt(eyebrow)}
        </p>
      ) : null}
      <h3 className={cn('mt-2 text-xl font-semibold tracking-tight sm:text-2xl', dark ? 'text-white' : 'text-slate-950')}>
        {tt(title)}
      </h3>
      <div className={cn('mt-4 min-w-0 sm:mt-5', bodyClassName)}>{children}</div>
    </div>
  );
}
