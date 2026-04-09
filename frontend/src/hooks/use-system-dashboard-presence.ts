'use client';

import { useEffect, useMemo } from 'react';
import { reportSystemDashboardPresenceRequest } from '@/lib/api';

export function useSystemDashboardPresence(systemIds: string[], pageKey: string) {
  const normalizedSystemIds = useMemo(
    () => [...new Set(systemIds.map((item) => item.trim()).filter(Boolean))],
    [systemIds],
  );

  useEffect(() => {
    if (!normalizedSystemIds.length) {
      return;
    }

    let disposed = false;

    const tick = async () => {
      if (disposed || typeof document === 'undefined' || document.visibilityState === 'hidden') {
        return;
      }

      try {
        await reportSystemDashboardPresenceRequest(normalizedSystemIds, pageKey);
      } catch {
        // Presence is best-effort only.
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 45_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [normalizedSystemIds, pageKey]);
}
