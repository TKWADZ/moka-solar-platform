'use client';

import Link from 'next/link';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PublicSection, SectionIntro } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { SalesDetailModal } from '@/components/sales-detail-modal';
import {
  buildContactHref,
  PublicSalesModel,
  PublicSolutionTrack,
} from '@/config/public-site';
import { openPublicChat } from '@/lib/public-site-events';

export default function SolutionsPage() {
  const { siteConfig } = usePublicSiteConfig();
  const [activeTrack, setActiveTrack] = useState<PublicSolutionTrack | null>(null);
  const [activeModel, setActiveModel] = useState<PublicSalesModel | null>(null);
  const activeTrackDetail = useMemo(() => activeTrack?.detail || null, [activeTrack]);
  const activeModelDetail = useMemo(() => activeModel?.detail || null, [activeModel]);

  return (
    <main>
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <PublicSection density="tight">
          <div className="hero-panel px-5 py-7 sm:px-8 sm:py-8">
            <p className="eyebrow text-slate-400">Giải pháp triển khai</p>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              Mỗi nhóm khách hàng nên được tư vấn theo một bài toán chi phí điện và vận hành khác nhau.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              Moka Solar tập trung vào các công trình cần một giải pháp điện mặt trời rõ chi phí, dễ
              triển khai và có lớp hỗ trợ đủ chắc sau ngày nghiệm thu.
            </p>
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <SectionIntro
            eyebrow="Nhóm công trình tiêu biểu"
            title="Bấm vào từng nhóm để xem mô hình phù hợp, cách vận hành và lợi ích khách hàng nhận được."
            actions={
              <button
                type="button"
                className="btn-ghost w-full sm:w-auto"
                onClick={() =>
                  openPublicChat('contact', 'Tôi muốn được tư vấn giải pháp điện mặt trời phù hợp.')
                }
              >
                Trao đổi với tư vấn viên
              </button>
            }
          />

          <div className="public-grid-3">
            {siteConfig.solutionTracks.map((track) => (
              <button
                key={track.id}
                type="button"
                className="surface-card overflow-hidden p-0 text-left transition hover:-translate-y-0.5 hover:border-white/16"
                onClick={() => setActiveTrack(track)}
              >
                <div
                  className="h-64"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.6)), url(${track.imageUrl})`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                  }}
                />
                <div className="p-6">
                  <p className="eyebrow text-slate-500">{track.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">{track.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{track.body}</p>
                  <div className="mt-6 inline-flex items-center text-sm font-semibold text-amber-100">
                    Xem chi tiết giải pháp
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-2">
            <div className="public-card-strong">
              <p className="eyebrow text-slate-400">Lộ trình triển khai</p>
              <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Từ khảo sát ban đầu đến vận hành định kỳ, mỗi bước đều cần đủ rõ để khách hàng yên tâm.
              </h3>

              <div className="mt-5 grid gap-3">
                {siteConfig.homepage.implementation.steps.map((step, index) => (
                  <div
                    key={`${step}-${index}`}
                    className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Bước {index + 1}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-slate-200">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
              {siteConfig.salesModels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="public-card text-left transition hover:-translate-y-0.5 hover:border-white/16"
                  onClick={() => setActiveModel(item)}
                >
                  <p className="eyebrow text-slate-500">{item.contractType}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{item.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.highlights.slice(0, 2).map((highlight) => (
                      <span key={highlight} className="metric-pill text-slate-100">
                        {highlight}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <p className="text-lg font-semibold text-white">{item.pricing}</p>
                    <span className="inline-flex items-center text-sm font-semibold text-amber-100">
                      Xem chi tiết
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </PublicSection>

        <PublicSection density="wide">
          <div className="hero-panel px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="eyebrow text-slate-400">Bước tiếp theo</p>
                <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-white">
                  Nếu bạn muốn hiểu rõ hơn phần vận hành và chăm sóc sau lắp đặt, hãy xem thêm trang vận hành.
                </h2>
              </div>
              <div className="cta-row mt-0">
                <Link href="/operations" className="btn-primary w-full sm:w-auto">
                  Xem trang vận hành
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href={buildContactHref('Tư vấn giải pháp triển khai điện mặt trời', siteConfig)}
                  className="btn-ghost w-full sm:w-auto"
                >
                  Để lại thông tin
                </Link>
              </div>
            </div>
          </div>
        </PublicSection>
      </PublicFeatureGate>

      <PublicFooter />

      <SalesDetailModal
        open={Boolean(activeTrack)}
        detail={activeTrackDetail}
        onClose={() => setActiveTrack(null)}
      />
      <SalesDetailModal
        open={Boolean(activeModel)}
        detail={activeModelDetail}
        pricing={activeModel?.pricing}
        badge={activeModel?.badge}
        onClose={() => setActiveModel(null)}
      />
    </main>
  );
}
