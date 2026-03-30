'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { featureCatalogRequest } from '@/lib/api';
import { SectionCard } from '@/components/section-card';
import { FeaturePlugin } from '@/types';

type PublicFeatureGateProps = {
  featureKey: string;
  title?: string;
  description?: string;
  children: ReactNode;
};

export function PublicFeatureGate({
  featureKey,
  title,
  description,
  children,
}: PublicFeatureGateProps) {
  const [catalog, setCatalog] = useState<FeaturePlugin[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasFetchError, setHasFetchError] = useState(false);

  useEffect(() => {
    let mounted = true;

    featureCatalogRequest()
      .then((items) => {
        if (!mounted) {
          return;
        }

        setCatalog(items);
        setLoaded(true);
        setHasFetchError(false);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setCatalog(null);
        setLoaded(true);
        setHasFetchError(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!loaded || hasFetchError || !catalog) {
    return <>{children}</>;
  }

  const enabled = catalog.some((plugin) => plugin.key === featureKey);

  if (enabled) {
    return <>{children}</>;
  }

  return (
    <section className="shell py-10">
      <SectionCard
        title={title || 'Tính năng đang tạm tắt'}
        eyebrow="Plugin công khai đang bị vô hiệu hóa"
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            {description ||
              'Trải nghiệm công khai này hiện đang bị tắt trong trung tâm plugin của admin.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="btn-dark">
              Đăng nhập
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
            >
              Liên hệ tư vấn
            </Link>
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
