'use client';

import Image from 'next/image';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { cn } from '@/lib/utils';

export default function CustomerLoading() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';

  return (
    <main
      data-customer-theme={theme}
      className="customer-shell flex min-h-screen items-center justify-center px-4 py-6"
    >
      <div className="customer-surface-card w-full max-w-sm p-6 text-center sm:p-7">
        <div
          className={cn(
            'mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] border',
            dark ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-slate-50',
          )}
        >
          <Image
            src="/brand/logo-moka-solar.png"
            alt="Moka Solar"
            width={56}
            height={56}
            className="h-14 w-auto object-contain"
            priority
          />
        </div>
        <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-slate-500">Moka Solar</p>
        <h1 className={cn('mt-3 text-xl font-semibold', dark ? 'text-white' : 'text-slate-950')}>
          Đang mở cổng khách hàng
        </h1>
        <p className={cn('mt-3 text-sm leading-6', dark ? 'text-slate-300' : 'text-slate-600')}>
          Hệ thống đang chuẩn bị dữ liệu sản lượng, hóa đơn và trạng thái vận hành gần nhất cho bạn.
        </p>
      </div>
    </main>
  );
}
