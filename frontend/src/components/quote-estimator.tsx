'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { buildContactHref } from '@/config/public-site';
import { openPublicChat } from '@/lib/public-site-events';
import { formatCurrency, formatNumber } from '@/lib/utils';

const siteProfiles = {
  cafe: {
    label: 'Cafe / nhà hàng',
    rooftopFactor: 0.95,
    recommendedModel: 'PPA / theo kWh',
  },
  villa: {
    label: 'Biệt thự / villa / homestay',
    rooftopFactor: 0.72,
    recommendedModel: 'Thuê hệ thống',
  },
  factory: {
    label: 'Nhà xưởng / doanh nghiệp nhỏ',
    rooftopFactor: 1.28,
    recommendedModel: 'Hybrid có lưu trữ',
  },
  school: {
    label: 'Trường học / cơ sở dịch vụ',
    rooftopFactor: 0.88,
    recommendedModel: 'Trả góp',
  },
} as const;

type SiteProfileKey = keyof typeof siteProfiles;

export function QuoteEstimator({ dark = false }: { dark?: boolean }) {
  const { siteConfig } = usePublicSiteConfig();
  const [siteType, setSiteType] = useState<SiteProfileKey>('cafe');
  const [monthlyBill, setMonthlyBill] = useState(12000000);
  const [roofArea, setRoofArea] = useState(160);

  const scenario = useMemo(() => {
    const profile = siteProfiles[siteType];
    const recommendedKwp = Math.max(
      6,
      Math.min((roofArea / 6.2) * profile.rooftopFactor, monthlyBill / 420000),
    );
    const monthlyProduction = recommendedKwp * 118;
    const evnReferencePrice = siteConfig.pricingPolicy.evnHighestTierPrice;
    const mokaReferencePrice = siteConfig.pricingPolicy.mokaReferencePrice;
    const estimatedUsageKwh = monthlyBill > 0 ? monthlyBill / evnReferencePrice : 0;
    const billableKwh = Math.max(0, Math.min(monthlyProduction, estimatedUsageKwh));
    const monthlySavings = Math.max(
      0,
      billableKwh * Math.max(evnReferencePrice - mokaReferencePrice, 0),
    );

    return {
      profile,
      recommendedKwp,
      monthlyProduction,
      estimatedUsageKwh,
      billableKwh,
      monthlySavings,
      annualSavings: monthlySavings * 12,
      paybackYears: siteConfig.pricingPolicy.estimatedPaybackYears,
    };
  }, [monthlyBill, roofArea, siteType, siteConfig.pricingPolicy]);

  const wrapperClass = dark
    ? 'hero-panel px-5 py-6 sm:px-8 sm:py-7'
    : 'surface-card-strong p-5 sm:p-6';
  const fieldClass = dark ? 'portal-field' : 'field';
  const resultCardClass = dark ? 'portal-card-soft p-4 sm:p-5' : 'public-card-soft';

  return (
    <div className={wrapperClass}>
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div>
          <p className="eyebrow text-slate-400">Ước tính sơ bộ trong 30 giây</p>
          <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
            Xem nhanh công suất gợi ý, sản lượng PV tháng và mức thanh toán theo chính sách Moka.
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Công cụ này dùng biểu giá EVN cao nhất làm mốc tham chiếu và mức giá Moka{' '}
            {formatCurrency(siteConfig.pricingPolicy.mokaReferencePrice)}/kWh, chưa gồm VAT, để bạn
            hình dung nhanh sản lượng, chi phí và mô hình phù hợp trước buổi khảo sát.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Loại công trình
              </span>
              <span className="text-xs leading-6 text-slate-500">
                Chọn nhóm công trình để ước tính nhanh công suất và mô hình thanh toán phù hợp hơn.
              </span>
              <select
                className={fieldClass}
                value={siteType}
                onChange={(event) => setSiteType(event.target.value as SiteProfileKey)}
              >
                {Object.entries(siteProfiles).map(([key, profile]) => (
                  <option key={key} value={key}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Tiền điện mỗi tháng
                </span>
                <span className="text-xs leading-6 text-slate-500">
                  Nhập mức chi trả điện hiện tại để ước tính nhanh phần tiết kiệm ban ngày.
                </span>
                <input
                  type="number"
                  className={fieldClass}
                  value={monthlyBill}
                  onChange={(event) => setMonthlyBill(Number(event.target.value || 0))}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Diện tích mái khả dụng
                </span>
                <span className="text-xs leading-6 text-slate-500">
                  Diện tích này giúp ước tính mức công suất có thể triển khai thực tế.
                </span>
                <input
                  type="number"
                  className={fieldClass}
                  value={roofArea}
                  onChange={(event) => setRoofArea(Number(event.target.value || 0))}
                />
              </label>
            </div>

            <div className="public-card-soft">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Mô hình gợi ý</p>
              <p className="mt-2 text-lg font-semibold text-white">{scenario.profile.recommendedModel}</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Mốc hoàn vốn tham khảo hiện lấy theo chính sách Moka Solar, với thời gian tham chiếu
                khoảng {formatNumber(scenario.paybackYears, 'năm')} khi công trình phù hợp và sản lượng
                vận hành đạt kịch bản tư vấn.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className={`${resultCardClass} min-w-0 sm:col-span-2`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Tiết kiệm tham khảo mỗi tháng
            </p>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[2.35rem] font-semibold tracking-[-0.06em] text-white sm:text-[3rem]">
                  {formatCurrency(scenario.monthlySavings)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Tính từ chênh lệch giữa giá EVN cao nhất và mức giá tham chiếu của Moka.
                </p>
              </div>
              <span className="metric-pill text-slate-100">{scenario.profile.recommendedModel}</span>
            </div>
          </div>

          <div className={`${resultCardClass} min-w-0`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Công suất gợi ý
            </p>
            <p className="mt-3 text-[clamp(1.75rem,4vw,2.2rem)] font-semibold leading-none tracking-[-0.05em] text-white">
              {formatNumber(scenario.recommendedKwp, 'kWp')}
            </p>
          </div>

          <div className={`${resultCardClass} min-w-0`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Sản lượng PV mỗi tháng
            </p>
            <p className="mt-3 text-[clamp(1.75rem,4vw,2.2rem)] font-semibold leading-none tracking-[-0.05em] text-white">
              {formatNumber(scenario.monthlyProduction, 'kWh')}
            </p>
          </div>

          <div className={`${resultCardClass} min-w-0 sm:col-span-2`}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Hoàn vốn tham khảo
                </p>
                <p className="mt-3 text-[clamp(1.7rem,3.8vw,2.15rem)] font-semibold leading-none tracking-[-0.05em] text-white">
                  {formatNumber(scenario.paybackYears, 'năm')}
                </p>
              </div>

              <div className="min-w-0 rounded-[20px] border border-white/6 bg-white/[0.02] px-4 py-4 sm:px-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Tiết kiệm mỗi năm
                </p>
                <p className="mt-3 min-w-0 max-w-full break-all text-[clamp(1.2rem,2.2vw,1.95rem)] font-semibold leading-tight tracking-[-0.05em] text-white">
                  {formatCurrency(scenario.annualSavings)}
                </p>
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.035] px-4 py-4 sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Lưu ý
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Đây là ước tính sơ bộ trước khảo sát thực tế. Sản lượng và hiệu quả phụ thuộc vào
                diện tích mái, hướng nắng, bóng che, thời gian sử dụng tải và cấu hình hệ thống.
                Đơn giá thực tế sẽ được xác nhận trong hợp đồng.
              </p>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="public-card-soft">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Chính sách giá tham chiếu
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {siteConfig.pricingPolicy.evnReferenceLabel}
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {formatCurrency(siteConfig.pricingPolicy.evnHighestTierPrice)}/kWh
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {siteConfig.pricingPolicy.evnHighestTierLabel}
                  </p>
                </div>

                <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
                    Giá điện cho thuê của Moka
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {siteConfig.pricingPolicy.mokaReferenceLabel}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/90">
                    {siteConfig.pricingPolicy.mokaReferenceNote}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-300">
                {siteConfig.pricingPolicy.billingRuleLabel}: {siteConfig.pricingPolicy.billingRuleNote}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Ước tính hiện tại đang lấy khoảng {formatNumber(scenario.billableKwh, 'kWh')} để tính tiền
                mỗi tháng, so với nhu cầu tham chiếu khoảng {formatNumber(scenario.estimatedUsageKwh, 'kWh')}.
              </p>

              <div className="cta-row mt-4">
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  onClick={() =>
                    openPublicChat(
                      'contact',
                      `Tôi muốn tư vấn cho công trình ${scenario.profile.label} với hóa đơn khoảng ${formatCurrency(monthlyBill)} mỗi tháng.`,
                    )
                  }
                >
                  {siteConfig.ctas.consultation.label}
                </button>
                <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full sm:w-auto">
                  {siteConfig.homepage.finalCta.secondaryLabel}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
