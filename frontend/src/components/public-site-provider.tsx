'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  mergePublicSiteConfig,
  PublicSiteConfig,
  publicSiteConfig,
} from '@/config/public-site';
import { websiteSettingsPublicRequest } from '@/lib/api';

type PublicSiteContextValue = {
  siteConfig: PublicSiteConfig;
  isUsingFallback: boolean;
  refreshSiteConfig: () => Promise<void>;
};

const PublicSiteContext = createContext<PublicSiteContextValue>({
  siteConfig: publicSiteConfig,
  isUsingFallback: true,
  refreshSiteConfig: async () => undefined,
});

export function PublicSiteProvider({ children }: { children: React.ReactNode }) {
  const [siteConfig, setSiteConfig] = useState(publicSiteConfig);
  const [isUsingFallback, setIsUsingFallback] = useState(true);

  async function refreshSiteConfig() {
    try {
      const record = await websiteSettingsPublicRequest();
      setSiteConfig(
        mergePublicSiteConfig(
          record.content as Partial<PublicSiteConfig> | undefined,
        ),
      );
      setIsUsingFallback(false);
    } catch {
      setSiteConfig(publicSiteConfig);
      setIsUsingFallback(true);
    }
  }

  useEffect(() => {
    void refreshSiteConfig();
  }, []);

  const value = useMemo(
    () => ({
      siteConfig,
      isUsingFallback,
      refreshSiteConfig,
    }),
    [isUsingFallback, siteConfig],
  );

  return (
    <PublicSiteContext.Provider value={value}>
      {children}
    </PublicSiteContext.Provider>
  );
}

export function usePublicSiteConfig() {
  return useContext(PublicSiteContext);
}
