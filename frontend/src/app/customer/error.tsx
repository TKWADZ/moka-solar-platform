'use client';

import { useEffect } from 'react';

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="portal-shell flex min-h-screen items-center justify-center px-4 py-8">
      <div className="portal-card max-w-xl p-8 text-center">
        <p className="eyebrow text-slate-500">Lỗi cổng khách hàng</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Không thể tải dữ liệu tài khoản ngay lúc này.</h1>
        <p className="mt-3 text-sm text-slate-300">
          Bạn có thể thử tải lại trang. Nếu lỗi vẫn còn, vui lòng đăng nhập lại hoặc liên hệ bộ phận vận hành để được hỗ trợ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Thử lại
          </button>
          <a href="/portal" className="btn-ghost">
            Về cổng khách hàng
          </a>
        </div>
      </div>
    </main>
  );
}
