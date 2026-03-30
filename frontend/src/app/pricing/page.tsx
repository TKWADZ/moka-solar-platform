'use client';

import Link from 'next/link';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PublicSection, SectionIntro } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { QuoteEstimator } from '@/components/quote-estimator';
import { SalesDetailModal } from '@/components/sales-detail-modal';
import { buildContactHref, PublicSalesModel } from '@/config/public-site';
import { openPublicChat } from '@/lib/public-site-events';
import { formatCurrency } from '@/lib/utils';

export default function PricingPage() {
  const { siteConfig } = usePublicSiteConfig();
  const [activeModel, setActiveModel] = useState<PublicSalesModel | null>(null);
  const activeDetail = useMemo(() => activeModel?.detail || null, [activeModel]);

  return (
    <main>
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <PublicSection density="tight">
          <div className="hero-panel px-5 py-7 sm:px-8 sm:py-8">
            <p className="eyebrow text-slate-400">Bảng giá và mô hình triển khai</p>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              Mỗi công trình nên được tư vấn theo đúng mô hình thanh toán và cách sử dụng điện thực tế.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              Moka Solar đề xuất mô hình theo mức tiêu thụ điện, nhu cầu đầu tư và cách vận hành của
              từng công trình. Bấm vào từng mô hình bên dưới để xem chi tiết và cách áp dụng phù hợp.
            </p>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {siteConfig.pricingPolicy.evnReferenceLabel}
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatCurrency(siteConfig.pricingPolicy.evnHighestTierPrice)}/kWh
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {siteConfig.pricingPolicy.evnHighestTierLabel}
                </p>
              </div>

              <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Giá điện cho thuê của Moka
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {siteConfig.pricingPolicy.mokaReferenceLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-50/90">
                  {siteConfig.pricingPolicy.mokaReferenceNote}
                </p>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Quy tắc tính tiền
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {siteConfig.pricingPolicy.billingRuleLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {siteConfig.pricingPolicy.billingRuleNote}
                </p>
              </div>
            </div>
          </div>
        </PublicSection>

        <PublicSection id="bang-gia" density="tight">
          <SectionIntro
            eyebrow="Mô hình phù hợp theo nhu cầu"
            title="Bấm vào từng gói để xem rõ đối tượng phù hợp, cách tính tiền và quyền lợi đi kèm."
            actions={
              <button
                type="button"
                className="btn-ghost w-full sm:w-auto"
                onClick={() =>
                  openPublicChat('contact', 'Tôi muốn được tư vấn chọn mô hình điện mặt trời phù hợp.')
                }
              >
                Nhận phương án sơ bộ
              </button>
            }
          />

          <div className="public-grid-2">
            {siteConfig.salesModels.map((item) => (
              <button
                key={item.id}
                type="button"
                className="public-card text-left transition hover:-translate-y-0.5 hover:border-white/16"
                onClick={() => setActiveModel(item)}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow text-slate-500">{item.contractType}</p>
                      <h3 className="mt-3 text-2xl font-semibold text-white">{item.name}</h3>
                    </div>
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
                      {item.badge}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-slate-300">{item.summary}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.highlights.map((highlight) => (
                      <span key={highlight} className="metric-pill text-slate-100">
                        {highlight}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex items-end justify-between gap-4">
                    <p className="text-xl font-semibold text-white sm:text-2xl">{item.pricing}</p>
                    <span className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-100">
                      Mở chi tiết mô hình
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </PublicSection>

        <PublicSection id="uoc-tinh" density="tight">
          <QuoteEstimator dark />
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-2">
            <div className="public-card-strong">
              <p className="eyebrow text-slate-400">Điều khách hàng thường quan tâm</p>
              <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Khách không chỉ hỏi giá, mà còn hỏi cách theo dõi và ai sẽ đồng hành sau khi triển khai.
              </h3>
              <div className="mt-5 grid gap-3">
                {[
                  'Có cần đầu tư toàn bộ vốn ngay hay không?',
                  'Mức tiết kiệm được nhìn thấy ở đâu và đo như thế nào?',
                  'Nếu có sự cố hoặc cần bảo trì thì ai là đầu mối hỗ trợ?',
                  'Hóa đơn và thanh toán sẽ được trình bày ra sao theo từng mô hình?',
                ].map((note) => (
                  <div
                    key={note}
                    className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-200"
                  >
                    {note}
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-panel px-5 py-6 sm:px-8">
              <p className="eyebrow text-slate-400">Bước tiếp theo</p>
              <h3 className="mt-3 text-3xl font-semibold text-white">
                Nhận một phương án sơ bộ đủ rõ để biết công trình của bạn nên đi theo hướng nào.
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Moka Solar sẽ cùng bạn chốt công suất phù hợp, cấu trúc thanh toán hợp lý và lộ trình
                triển khai khả thi trước buổi khảo sát thực tế.
              </p>
              <div className="cta-row">
                <Link
                  href={buildContactHref('Tư vấn phương án điện mặt trời cho công trình', siteConfig)}
                  className="btn-primary w-full sm:w-auto"
                >
                  Nhận phương án sơ bộ
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
                <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full sm:w-auto">
                  Chat Zalo
                </a>
              </div>
            </div>
          </div>
        </PublicSection>
      </PublicFeatureGate>

      <PublicFooter />

      <SalesDetailModal
        open={Boolean(activeModel)}
        detail={activeDetail}
        pricing={activeModel?.pricing}
        badge={activeModel?.badge}
        onClose={() => setActiveModel(null)}
      />
    </main>
  );
}
