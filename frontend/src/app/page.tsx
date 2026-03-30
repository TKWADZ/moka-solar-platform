'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Hero } from '@/components/hero';
import { PublicSection, SectionIntro } from '@/components/public-layout';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { QuoteEstimator } from '@/components/quote-estimator';
import { SalesDetailModal } from '@/components/sales-detail-modal';
import { buildContactHref, PublicSalesModel } from '@/config/public-site';
import { openPublicChat } from '@/lib/public-site-events';

const trustIcons = [CircleDollarSign, ShieldCheck, LayoutDashboard, Wrench];

export default function HomePage() {
  const { siteConfig } = usePublicSiteConfig();
  const [activeModel, setActiveModel] = useState<PublicSalesModel | null>(null);
  const featuredModels = siteConfig.salesModels;
  const activeDetail = useMemo(() => activeModel?.detail || null, [activeModel]);

  return (
    <main>
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <Hero />

        <PublicSection>
          <SectionIntro
            eyebrow="Lợi ích chính"
            title="Rõ chi phí, rõ mô hình triển khai và rõ cách liên hệ ngay từ lần xem đầu."
          />

          <div className="public-grid-3">
            {siteConfig.homepage.benefits.map((benefit) => (
              <div key={benefit.title} className="public-card">
                <p className="text-lg font-semibold text-white">{benefit.title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{benefit.body}</p>
              </div>
            ))}
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <SectionIntro
            eyebrow="Các mô hình dịch vụ"
            title="Chọn đúng mô hình thanh toán trước khi chốt công suất và lịch triển khai."
            actions={
              <>
                <Link href="/pricing" className="btn-ghost w-full sm:w-auto">
                  Xem toàn bộ bảng giá
                </Link>
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  onClick={() =>
                    openPublicChat('contact', 'Tôi muốn được tư vấn chọn mô hình điện mặt trời phù hợp.')
                  }
                >
                  Tư vấn mô hình phù hợp
                </button>
              </>
            }
          />

          <div className="public-grid-2">
            {featuredModels.map((item) => (
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
                      <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{item.name}</h3>
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

                  <div className="mt-5 flex items-end justify-between gap-3">
                    <p className="text-lg font-semibold text-white sm:text-xl">{item.pricing}</p>
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

        <PublicSection id="uoc-tinh">
          <div className="public-grid-2">
            <QuoteEstimator dark />

            <div className="public-card-strong">
              <p className="eyebrow text-slate-400">{siteConfig.homepage.companyStory.eyebrow}</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {siteConfig.homepage.companyStory.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {siteConfig.homepage.companyStory.body}
              </p>

              <div className="mt-5 grid gap-3">
                {siteConfig.homepage.companyStory.trustPoints.map((item, index) => {
                  const Icon = trustIcons[index] || ShieldCheck;

                  return (
                    <div key={item.title} className="public-card-soft">
                      <div className="flex items-start gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 p-2 text-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-base font-semibold text-white">{item.title}</p>
                          <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </PublicSection>

        <PublicSection>
          <SectionIntro
            eyebrow={siteConfig.homepage.caseStudies.eyebrow}
            title={siteConfig.homepage.caseStudies.title}
            body={siteConfig.homepage.caseStudies.description}
          />

          <div className="public-grid-3">
            {siteConfig.homepage.caseStudies.items.map((item) => (
              <div key={item.title} className="surface-card overflow-hidden p-0">
                <div className="gallery-card relative h-56">
                  <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/70">{item.segment}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{item.capacity}</p>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm font-semibold text-emerald-200">{item.result}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </PublicSection>

        <PublicSection>
          <div className="public-grid-2">
            <div className="public-card-strong">
              <p className="eyebrow text-slate-400">{siteConfig.homepage.implementation.eyebrow}</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {siteConfig.homepage.implementation.title}
              </h2>

              <div className="mt-5 grid gap-3">
                {siteConfig.homepage.implementation.steps.map((step, index) => (
                  <div key={`${step}-${index}`} className="public-card-soft">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Bước {index + 1}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-200">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-panel px-5 py-6 sm:px-6">
              <p className="eyebrow text-slate-400">Trang vận hành</p>
              <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {siteConfig.homepage.implementation.operationsTeaserTitle}
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {siteConfig.homepage.implementation.operationsTeaserBody}
              </p>

              <div className="mt-5 grid gap-3">
                {siteConfig.operationsPage.pillars.slice(0, 3).map((item) => (
                  <div key={item.title} className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-base font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
                  </div>
                ))}
              </div>

              <div className="cta-row">
                <Link href={siteConfig.homepage.implementation.operationsCtaHref} className="btn-primary w-full sm:w-auto">
                  {siteConfig.homepage.implementation.operationsCtaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <button
                  type="button"
                  className="btn-ghost w-full sm:w-auto"
                  onClick={() =>
                    openPublicChat('contact', 'Tôi muốn tìm hiểu cách Moka Solar vận hành và hỗ trợ sau lắp đặt.')
                  }
                >
                  Nhắn đội ngũ tư vấn
                </button>
              </div>
            </div>
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <SectionIntro
            eyebrow="Câu hỏi thường gặp"
            title="Những điều khách hàng thường hỏi trước khi khảo sát và lắp đặt."
          />

          <div className="public-grid-2">
            {siteConfig.homepage.faq.map((item) => (
              <div key={item.question} className="public-card">
                <h3 className="text-lg font-semibold text-white">{item.question}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.answer}</p>
              </div>
            ))}
          </div>
        </PublicSection>

        <PublicSection density="wide">
          <div className="hero-panel relative px-5 py-7 sm:px-8 sm:py-8">
            <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
              <div>
                <p className="eyebrow text-slate-400">{siteConfig.homepage.finalCta.eyebrow}</p>
                <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
                  {siteConfig.homepage.finalCta.title}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  {siteConfig.homepage.finalCta.body}
                </p>
                <div className="cta-row mt-7">
                  <Link
                    href={buildContactHref('Tôi muốn nhận tư vấn điện mặt trời cho công trình của mình', siteConfig)}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {siteConfig.homepage.finalCta.primaryLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full sm:w-auto">
                    {siteConfig.homepage.finalCta.secondaryLabel}
                  </a>
                </div>
              </div>

              <div className="gallery-card relative min-h-[260px]">
                <Image
                  src="/brand/moka-premium-canopy.jpg"
                  alt="Công trình điện mặt trời Moka Solar"
                  fill
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">
                    Moka Solar x Công ty TNHH Truyền thông Moka
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white sm:text-2xl">
                    Một website đủ đẹp để chốt khách hàng, và đủ rõ để vận hành lâu dài.
                  </p>
                </div>
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
