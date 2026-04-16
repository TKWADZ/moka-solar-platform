'use client';

import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type CustomerToastTone = 'success' | 'error' | 'info';

export type CustomerToastState = {
  id: number;
  message: string;
  tone: CustomerToastTone;
} | null;

export function useCustomerToast() {
  const [toast, setToast] = useState<CustomerToastState>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3800);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  return {
    toast,
    dismissToast: () => setToast(null),
    showToast: (message: string, tone: CustomerToastTone = 'info') =>
      setToast({
        id: Date.now(),
        message,
        tone,
      }),
  };
}

export function CustomerToastViewport({
  toast,
  onClose,
}: {
  toast: CustomerToastState;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  const Icon =
    toast.tone === 'success'
      ? CheckCircle2
      : toast.tone === 'error'
        ? CircleAlert
        : Info;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.3rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 sm:bottom-6 sm:justify-end">
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[24px] border px-4 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl',
          toast.tone === 'success'
            ? 'border-emerald-200 bg-white/96 text-slate-900'
            : toast.tone === 'error'
              ? 'border-rose-200 bg-white/96 text-slate-900'
              : 'border-slate-200 bg-white/96 text-slate-900',
        )}
        role="status"
        aria-live="polite"
      >
        <div
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
            toast.tone === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : toast.tone === 'error'
                ? 'bg-rose-50 text-rose-700'
                : 'bg-slate-100 text-slate-700',
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <p className="min-w-0 flex-1 text-sm leading-6">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng thông báo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
