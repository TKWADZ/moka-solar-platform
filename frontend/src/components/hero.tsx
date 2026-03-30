'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bolt,
  ChartNoAxesCombined,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { buildContactHref } from '@/config/public-site';

const productionBars = [38, 46, 58, 64, 61, 74, 82, 78];

export function Hero() {
  const { siteConfig } = usePublicSiteConfig();
  const { hero } = siteConfig.homepage;

  return (
    <section className="public-section-tight pt-3 sm:pt-4">
      <div className="hero-panel relative isolate overflow-hidden px-4 py-5 sm:px-7 sm:py-8 lg:min-h-[78vh] lg:px-10 lg:py-10">
        <Image
          src="/brand/moka-premium-rooftop.jpg"
          alt="Công trình điện mặt trời Moka Solar"
          fill
          priority
          className="object-cover object-center opacity-[0.32]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.26),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.14),transparent_24%),linear-gradient(180deg,rgba(5,9,22,0.08),rgba(5,9,22,0.84))]" />

        <div className="relative grid gap-6 xl:grid-cols-[1.02fr_0.98fr] xl:items-end">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              <span className="metric-pill border-amber-300/20 bg-amber-400/10 text-amber-50">
                <ShieldCheck className="h-3.5 w-3.5" />
                Phù hợp với công trình cần hiệu quả và tính thực thi
              </span>
              <span className="metric-pill">
                <BadgeCheck className="h-3.5 w-3.5" />
                {siteConfig.brand.legalName}
              </span>
            </div>

            <div>
              <p className="eyebrow text-slate-300">{hero.eyebrow}</p>
              <h1 className="mt-4 max-w-4xl text-[2.5rem] font-semibold leading-[0.96] text-white sm:text-[3.6rem] lg:text-[4.65rem]">
                {hero.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base sm:leading-8">
                {hero.description}
              </p>
            </div>

            <div className="grid gap-2.5 md:grid-cols-3">
              {hero.highlights.map((item) => (
                <div
                  key={item}
                  className="rounded-[20px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm leading-6 text-slate-100"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Link
                href={buildContactHref('Tư vấn điện mặt trời cho công trình của tôi', siteConfig)}
                className="btn-primary w-full"
              >
                {hero.primaryCtaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full">
                {hero.secondaryCtaLabel}
              </a>
              <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full">
                <PhoneCall className="mr-2 h-4 w-4" />
                {hero.tertiaryCtaLabel}
              </a>
            </div>

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-200">
              TEST AUTO DEPLOY OK
            </p>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-xs leading-6 text-slate-300">
                <span className="font-semibold text-white">{siteConfig.brand.name}</span> là
                thương hiệu dịch vụ điện mặt trời do{' '}
                <span className="font-semibold text-white">{siteConfig.brand.legalName}</span>{' '}
                vận hành. {siteConfig.contact.businessHoursLabel.toLowerCase()}.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {hero.metricCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm"
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  <p className="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-white sm:text-[2.15rem]">
                    {item.value}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="brand-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <BrandLogo
                    compact
                    priority
                    logoWrapClassName="bg-white/95"
                    caption={siteConfig.brand.platformLabel}
                    captionClassName="text-slate-400"
                  />
                  <h2 className="mt-4 text-xl font-semibold text-white sm:text-2xl">
                    Một giải pháp đủ rõ để khách hàng ra quyết định và đủ chắc để vận hành lâu dài.
                  </h2>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  Dịch vụ trọn vòng đời
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/10 bg-black/18 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Điều khách hàng quan tâm
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Hiểu nhanh mức tiết kiệm, mô hình thanh toán và cách liên hệ
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Tiết kiệm bao nhiêu, có cần vốn lớn không, liên hệ ở đâu.
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/18 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Sau khi lắp đặt
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Có sản lượng, hóa đơn và đầu mối hỗ trợ rõ ràng
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Khách không bị bỏ lại sau ngày nghiệm thu.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
                <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Hiệu quả tham khảo
                        </p>
                        <p className="mt-2 text-base font-semibold text-white">
                          Sản lượng tháng, mức thanh toán và phần tiết kiệm được trình bày dễ hiểu
                        </p>
                    </div>
                    <ChartNoAxesCombined className="h-5 w-5 text-slate-200" />
                  </div>

                  <div className="mt-6 flex h-[148px] items-end gap-2 sm:h-[164px]">
                    {productionBars.map((value, index) => (
                      <div key={`${value}-${index}`} className="flex-1 rounded-full bg-white/5 p-1">
                        <div
                          className="rounded-full bg-gradient-to-t from-amber-300 via-emerald-300 to-cyan-300"
                          style={{ height: `${value}%` }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                    <Bolt className="h-3.5 w-3.5 text-amber-200" />
                    Phù hợp để tư vấn nhanh cho villa, homestay, cafe, nhà hàng và SME.
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="gallery-card relative h-[126px]">
                    <Image
                      src="/brand/moka-site-rooftop.jpg"
                      alt="Công trình điện mặt trời"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/70">
                        Công trình tham khảo
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        Công trình thực tế của Moka Solar trên nhóm khách hàng cao cấp và thương mại
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {hero.visualCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-[20px] border border-white/10 bg-white/[0.05] p-4"
                      >
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-white">{card.title}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {hero.visualStats.map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{stat.label}</p>
                        <p className="mt-2 text-xl font-semibold text-white">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
