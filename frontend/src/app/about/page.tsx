'use client';

import { PublicSection } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';

export default function AboutPage() {
  const { siteConfig } = usePublicSiteConfig();

  return (
    <main>
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <PublicSection density="tight">
          <div className="hero-panel px-5 py-7 sm:px-8 sm:py-8">
            <p className="eyebrow text-slate-400">Giới thiệu doanh nghiệp</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              {siteConfig.brand.name} là thương hiệu dịch vụ điện mặt trời do{' '}
              {siteConfig.brand.legalName} phát triển.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              Chúng tôi tập trung vào nhóm khách hàng cần một giải pháp điện mặt trời rõ chi phí, gọn
              vận hành và có đầu mối hỗ trợ sau lắp đặt.
            </p>
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-3">
            <div className="public-card">
              <p className="eyebrow text-slate-500">Định hướng thương hiệu</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Premium, hiện đại, tối giản</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Moka Solar theo đuổi cách làm việc gọn, sạch và đáng tin trong tài liệu triển khai,
                hồ sơ bàn giao và cổng khách hàng.
              </p>
            </div>

            <div className="public-card">
              <p className="eyebrow text-slate-500">Nhóm khách hàng trọng tâm</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Villa, homestay, cafe và SME</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Chúng tôi ưu tiên các công trình cần giải pháp rõ tiền, dễ hiểu và có lớp chăm sóc sau
                bán hàng bài bản.
              </p>
            </div>

            <div className="public-card">
              <p className="eyebrow text-slate-500">Cách phục vụ</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Từ tư vấn đến vận hành</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Moka Solar không chỉ dừng ở phần triển khai. Chúng tôi chuẩn bị cả lớp theo dõi sản
                lượng, hóa đơn, hỗ trợ vận hành và quy trình chăm sóc để khách hàng an tâm hơn lâu dài.
              </p>
            </div>
          </div>
        </PublicSection>
      </PublicFeatureGate>
      <PublicFooter />
    </main>
  );
}
