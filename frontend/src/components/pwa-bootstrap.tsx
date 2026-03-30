'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_PATH = '/sw.js';

export function PwaBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
      } catch (error) {
        if (!cancelled) {
          console.warn('Không thể đăng ký service worker cho Moka Solar PWA.', error);
        }
      }
    };

    if (document.readyState === 'complete') {
      void registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', registerServiceWorker);
    };
  }, []);

  return null;
}
