'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isIosDevice, isStandaloneDisplayMode } from '@/lib/customer-app';

const DISMISS_KEY = 'moka-customer-app-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function CustomerAppInstallCard({ className }: { className?: string }) {
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
        'portal-card-soft overflow-hidden border border-emerald-200/10 bg-gradient-to-br from-emerald-400/10 via-teal-300/5 to-white/[0.04] p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-100/80">Ứng dụng khách hàng</p>
          <h2 className="mt-2 text-base font-semibold text-white sm:text-lg">
            Cài Moka Solar lên điện thoại để mở nhanh như một app.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-200/88">
            Theo dõi sản lượng, hóa đơn, thanh toán và hỗ trợ chỉ với một chạm từ màn hình chính.
          </p>

          {showIosHint ? (
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Trên iPhone, hãy chạm nút Chia sẻ trong Safari rồi chọn <span className="font-semibold text-white">Thêm vào Màn hình chính</span>.
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
            <button type="button" onClick={handleDismiss} className="btn-ghost min-h-[46px] sm:min-h-[48px]">
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
