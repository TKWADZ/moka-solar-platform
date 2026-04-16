'use client';

import { useEffect } from 'react';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { cn } from '@/lib/utils';

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      data-customer-theme={theme}
      className="customer-shell flex min-h-screen items-center justify-center px-4 py-8"
    >
      <div className="customer-surface-card max-w-xl p-8 text-center">
        <p className="eyebrow text-slate-500">Lỗi cổng khách hàng</p>
        <h1 className={cn('mt-3 text-2xl font-semibold', dark ? 'text-white' : 'text-slate-950')}>
          Không thể tải dữ liệu tài khoản ngay lúc này.
        </h1>
        <p className={cn('mt-3 text-sm', dark ? 'text-slate-300' : 'text-slate-600')}>
          Bạn có thể thử tải lại trang. Nếu lỗi vẫn còn, vui lòng đăng nhập lại
          hoặc liên hệ bộ phận vận hành để được hỗ trợ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Thử lại
          </button>
          <a href="/portal" className="btn-secondary-light">
            Về cổng khách hàng
          </a>
        </div>
      </div>
    </main>
  );
}
