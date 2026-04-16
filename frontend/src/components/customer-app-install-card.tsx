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
        'customer-soft-card overflow-hidden border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-700/80">
            Ung dung khach hang
          </p>
          <h2 className="mt-2 text-base font-semibold text-slate-950 sm:text-lg">
            Cai Moka Solar len dien thoai de mo nhanh nhu mot app.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Theo doi san luong, hoa don, thanh toan va ho tro chi voi mot cham tu man hinh chinh.
          </p>

          {showIosHint ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Tren iPhone, hay cham nut Chia se trong Safari roi chon{' '}
              <span className="font-semibold text-slate-950">Them vao Man hinh chinh</span>.
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
                {isInstalling ? 'Dang chuan bi' : 'Cai ung dung'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:min-h-[48px]"
            >
              De sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
