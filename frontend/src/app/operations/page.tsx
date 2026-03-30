'use client';

import Link from 'next/link';
import { ArrowUpRight, BarChart3, LifeBuoy, ShieldCheck, Wrench } from 'lucide-react';
import { PublicSection } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { buildContactHref } from '@/config/public-site';

const pillarIcons = [BarChart3, Wrench, LifeBuoy, ShieldCheck];

export default function OperationsPage() {
  const { siteConfig } = usePublicSiteConfig();

  return (
    <main>
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <PublicSection density="tight">
          <div className="hero-panel px-5 py-7 sm:px-8 sm:py-8">
            <p className="eyebrow text-slate-400">{siteConfig.operationsPage.hero.eyebrow}</p>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              {siteConfig.operationsPage.hero.title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              {siteConfig.operationsPage.hero.description}
            </p>
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-4">
            {siteConfig.operationsPage.pillars.map((item, index) => {
              const Icon = pillarIcons[index] || ShieldCheck;

              return (
                <div key={item.title} className="public-card">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 p-2 text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold text-white">{item.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              );
            })}
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-2">
            <div className="public-card-strong">
              <p className="eyebrow text-slate-400">Khi có vấn đề phát sinh</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Mỗi sự cố đều cần một đầu mối tiếp nhận, xác minh và phản hồi đủ rõ.
              </h2>
              <div className="mt-5 grid gap-3">
                {siteConfig.operationsPage.responseFlow.map((step, index) => (
                  <div key={`${step}-${index}`} className="public-card-soft">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Bước {index + 1}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-slate-200">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="public-card">
              <p className="eyebrow text-slate-400">Khách hàng nhìn thấy gì</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Khách hàng có đủ dữ liệu để theo dõi hệ thống sau lắp đặt một cách rõ ràng.
              </h2>
              <div className="mt-5 grid gap-3">
                {siteConfig.operationsPage.customerTools.map((tool) => (
                  <div key={tool} className="public-card-soft text-sm leading-7 text-slate-200">
                    {tool}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PublicSection>

        <PublicSection density="wide">
          <div className="hero-panel px-5 py-7 sm:px-8 sm:py-8">
            <div className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
              <div>
                <p className="eyebrow text-slate-400">Cam kết dịch vụ</p>
                <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                  Một dịch vụ điện mặt trời chỉ đáng tin khi sau lắp đặt vẫn có đội ngũ theo dõi và phản hồi rõ ràng.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Moka Solar tổ chức theo dõi sản lượng, đối soát hóa đơn, tiếp nhận hỗ trợ và nhắc
                  bảo trì theo cùng một quy trình dịch vụ để khách hàng yên tâm hơn trong suốt quá trình
                  sử dụng.
                </p>
              </div>

              <div className="grid gap-3">
                {siteConfig.operationsPage.commitments.map((item) => (
                  <div
                    key={item}
                    className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4 text-sm leading-7 text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="cta-row mt-7">
              <Link
                href={buildContactHref(
                  'Tư vấn cách Moka Solar vận hành và hỗ trợ sau lắp đặt',
                  siteConfig,
                )}
                className="btn-primary w-full sm:w-auto"
              >
                Nhận tư vấn
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
              <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full sm:w-auto">
                Nhắn Zalo
              </a>
            </div>
          </div>
        </PublicSection>
      </PublicFeatureGate>

      <PublicFooter />
    </main>
  );
}
