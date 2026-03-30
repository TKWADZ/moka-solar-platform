'use client';

import { PublicSection } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';

export default function PrivacyPage() {
  const { siteConfig } = usePublicSiteConfig();

  return (
    <main>
      <PublicHeader />
      <PublicSection density="tight">
        <div className="surface-card-strong px-5 py-7 sm:px-8 sm:py-8">
          <p className="eyebrow text-slate-400">Chính sách bảo mật</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-5xl">
            Cách Moka Solar tiếp nhận và sử dụng thông tin khách hàng.
          </h1>
          <div className="mt-6 grid gap-4 text-sm leading-7 text-slate-300">
            <p>
              {siteConfig.brand.name} do {siteConfig.brand.legalName} vận hành. Chúng tôi
              chỉ sử dụng thông tin khách hàng để tư vấn, theo dõi yêu cầu, chăm sóc sau bán hàng và
              cải thiện chất lượng dịch vụ.
            </p>
            <p>
              Thông tin như họ tên, số điện thoại, email, địa chỉ công trình hoặc nội dung nhu cầu sẽ
              được dùng cho mục đích liên hệ tư vấn, lập proposal và hỗ trợ vận hành nếu hai bên đi
              tiếp tới giai đoạn triển khai.
            </p>
            <p>
              Moka Solar không bán thông tin khách hàng cho bên thứ ba. Trong trường hợp cần phối hợp
              khảo sát, triển khai hoặc hỗ trợ kỹ thuật, dữ liệu chỉ được chia sẻ trong phạm vi cần
              thiết để hoàn thành dịch vụ.
            </p>
            <p>
              Nếu bạn cần cập nhật, chỉnh sửa hoặc yêu cầu xóa thông tin đã gửi, vui lòng liên hệ qua
              hotline {siteConfig.contact.hotlineLabel} hoặc email {siteConfig.contact.emailLabel}.
            </p>
          </div>
        </div>
      </PublicSection>
      <PublicFooter />
    </main>
  );
}
