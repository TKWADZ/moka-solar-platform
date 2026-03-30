'use client';

import { useEffect } from 'react';

export default function AdminError({
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
        <p className="eyebrow text-slate-500">Lỗi hiển thị admin</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Không thể tải khu vực quản trị vào lúc này.</h1>
        <p className="mt-3 text-sm text-slate-300">
          Hệ thống đã chặn lỗi để bạn không bị mắc kẹt ở trạng thái loading. Bạn có thể tải lại trang hoặc quay về dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Thử lại
          </button>
          <a href="/admin" className="btn-ghost">
            Về dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
