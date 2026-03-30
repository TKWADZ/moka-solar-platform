'use client';

import { PublicSection } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';

export default function TermsPage() {
  const { siteConfig } = usePublicSiteConfig();

  return (
    <main>
      <PublicHeader />
      <PublicSection density="tight">
        <div className="surface-card-strong px-5 py-7 sm:px-8 sm:py-8">
          <p className="eyebrow text-slate-400">Điều khoản sử dụng</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-5xl">
            Nguyên tắc sử dụng website và các kênh tư vấn của Moka Solar.
          </h1>
          <div className="mt-6 grid gap-4 text-sm leading-7 text-slate-300">
            <p>
              Website {siteConfig.brand.name} cung cấp thông tin tham khảo về giải pháp điện mặt
              trời, mô hình thanh toán, quy trình triển khai và kênh liên hệ tư vấn. Nội dung trên
              website không thay thế cho proposal hoặc hợp đồng chính thức giữa hai bên.
            </p>
            <p>
              Các số liệu tiết kiệm, công suất hay ví dụ hóa đơn trên website được dùng để minh họa
              định hướng tư vấn. Đề xuất cuối cùng sẽ phụ thuộc vào khảo sát thực tế, phụ tải điện,
              điều kiện mái và phạm vi dịch vụ được chốt.
            </p>
            <p>
              Người dùng không được sử dụng website hoặc chatbot AI công khai cho mục đích spam, khai
              thác ngoài chủ đề, gây quá tải hệ thống hoặc vi phạm pháp luật hiện hành.
            </p>
            <p>
              Moka Solar có quyền cập nhật nội dung, cấu trúc dịch vụ hoặc các chính sách liên quan để
              phù hợp với hoạt động kinh doanh và yêu cầu pháp lý tại từng thời điểm.
            </p>
          </div>
        </div>
      </PublicSection>
      <PublicFooter />
    </main>
  );
}
