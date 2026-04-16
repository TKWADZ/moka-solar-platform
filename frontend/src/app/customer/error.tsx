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
    <main className="customer-shell flex min-h-screen items-center justify-center px-4 py-8">
      <div className="customer-surface-card max-w-xl p-8 text-center">
        <p className="eyebrow text-slate-500">Loi cong khach hang</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Khong the tai du lieu tai khoan ngay luc nay.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Ban co the thu tai lai trang. Neu loi van con, vui long dang nhap lai
          hoac lien he bo phan van hanh de duoc ho tro.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Thu lai
          </button>
          <a href="/portal" className="btn-secondary-light">
            Ve cong khach hang
          </a>
        </div>
      </div>
    </main>
  );
}
