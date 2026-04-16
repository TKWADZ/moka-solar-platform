'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Smartphone } from 'lucide-react';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { cn } from '@/lib/utils';
import { isIosDevice, isStandaloneDisplayMode } from '@/lib/customer-app';

const DISMISS_KEY = 'moka-customer-app-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function CustomerAppInstallCard({ className }: { className?: string }) {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    setIsStandalone(isStandaloneDisplayMode());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const showIosHint = useMemo(
    () => !isStandalone && !deferredPrompt && isIosDevice() && !dismissed,
    [deferredPrompt, dismissed, isStandalone],
  );

  if (isStandalone || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome !== 'accepted') {
        setDeferredPrompt(null);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className={cn(
        'customer-soft-card overflow-hidden p-4 sm:p-5',
        dark
          ? 'border border-white/10 bg-gradient-to-br from-emerald-500/12 via-slate-950 to-teal-500/10'
          : 'border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
            dark ? 'bg-emerald-400/15 text-emerald-200' : 'bg-emerald-100 text-emerald-700',
          )}
        >
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[11px] uppercase tracking-[0.22em]',
              dark ? 'text-emerald-200/80' : 'text-emerald-700/80',
            )}
          >
            Ứng dụng khách hàng
          </p>
          <h2
            className={cn(
              'mt-2 text-base font-semibold sm:text-lg',
              dark ? 'text-white' : 'text-slate-950',
            )}
          >
            Cài Moka Solar lên điện thoại để mở nhanh như một app.
          </h2>
          <p
            className={cn(
              'mt-2 text-sm leading-6',
              dark ? 'text-slate-300' : 'text-slate-600',
            )}
          >
            Theo dõi sản lượng, hóa đơn, thanh toán và hỗ trợ chỉ với một chạm từ màn hình chính.
          </p>

          {showIosHint ? (
            <p
              className={cn(
                'mt-3 text-sm leading-6',
                dark ? 'text-slate-300' : 'text-slate-600',
              )}
            >
              Trên iPhone, hãy chạm nút Chia sẻ trong Safari rồi chọn{' '}
              <span className={cn('font-semibold', dark ? 'text-white' : 'text-slate-950')}>
                Thêm vào Màn hình chính
              </span>
              .
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {deferredPrompt ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={isInstalling}
                className="btn-primary min-h-[46px] flex-1 sm:min-h-[48px]"
              >
                <ArrowDownToLine className="h-4 w-4" />
                {isInstalling ? 'Đang chuẩn bị' : 'Cài ứng dụng'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                'inline-flex min-h-[46px] items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition sm:min-h-[48px]',
                dark
                  ? 'border border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
