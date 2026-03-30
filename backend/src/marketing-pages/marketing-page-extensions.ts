import type { DefaultMarketingPage } from './default-marketing-pages';

export const ADDITIONAL_MARKETING_PAGES: DefaultMarketingPage[] = [
  {
    key: 'solutions',
    name: 'Giải pháp',
    description: 'Trang giới thiệu các hướng giải pháp theo nhóm khách hàng.',
    published: true,
    sortOrder: 40,
    content: {
      vi: {
        hero: {
          eyebrow: 'Giải pháp điện mặt trời',
          title:
            'Ba hướng triển khai rõ ràng để bán và vận hành dự án điện mặt trời tại Việt Nam.',
          description:
            'Tách rõ câu chuyện cho nhà ở, thương mại và phần mềm vận hành để đội kinh doanh trao đổi với khách hàng dễ hơn và chốt nhanh hơn.',
        },
        tracks: [
          {
            eyebrow: 'Nhà ở và villa',
            title:
              'Kết hợp điện mặt trời mái nhà với trải nghiệm cổng khách hàng và khả năng sẵn sàng cho pin lưu trữ.',
            body:
              'Phù hợp cho villa, nhà ở cao cấp và mô hình lưu trú muốn vừa tiết kiệm điện vừa tăng giá trị tài sản.',
            imageUrl:
              'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=80',
          },
          {
            eyebrow: 'Thương mại và SME',
            title:
              'Giảm chi phí điện ban ngày mà không ép mọi khách hàng phải đầu tư ngay một khoản capex lớn.',
            body:
              'Dùng PPA, lease hoặc hybrid để khớp đúng cách doanh nghiệp Việt thực sự mua các giải pháp năng lượng.',
            imageUrl:
              'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1400&q=80',
          },
          {
            eyebrow: 'Phần mềm vận hành',
            title:
              'Hợp nhất lời hứa bán hàng, giám sát hệ thống, hóa đơn, thanh toán và hỗ trợ trong cùng một nền tảng.',
            body:
              'Đây là lớp vận hành mà các website premium ám chỉ, nhưng phần lớn doanh nghiệp địa phương vẫn đang thiếu.',
            imageUrl:
              'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1400&q=80',
          },
        ],
        deliverySection: {
          eyebrow: 'Lộ trình triển khai',
          title: 'Dự án đi từ giai đoạn bán hàng sang vận hành như thế nào.',
          steps: [
            'Khảo sát biểu đồ phụ tải và diện tích mái khả dụng',
            'Đề xuất mô hình hợp đồng và mức tiết kiệm dự kiến',
            'Lắp đặt hệ thống, kết nối giám sát và mở cổng khách hàng',
            'Vận hành lập hóa đơn, thu tiền và hỗ trợ từ một trung tâm điều hành',
          ],
        },
        packagesSection: {
          eyebrow: 'Mô hình thương mại',
          title:
            'Các gói bảng giá bên dưới có thể dùng lại trực tiếp trong luồng tư vấn giải pháp.',
        },
        nextStepCta: {
          eyebrow: 'Bước tiếp theo',
          title:
            'Chọn đúng mô hình điện mặt trời trước, sau đó để nền tảng xử lý phần vận hành phức tạp.',
          primaryCta: {
            label: 'So sánh bảng giá',
            href: '/pricing',
          },
          secondaryCta: {
            label: 'Trao đổi với tư vấn viên',
            href: '/contact',
          },
        },
      },
      en: {
        hero: {
          eyebrow: 'Solar solutions',
          title:
            'Three clear solution tracks for selling and operating solar projects in Vietnam.',
          description:
            'Separate the story for homes, commercial sites and operator software so sales teams can speak more clearly and close faster.',
        },
        tracks: [
          {
            eyebrow: 'Residential and villa',
            title:
              'Pair rooftop solar with homeowner reporting and battery-ready operations.',
            body:
              'Best for villas, premium homes and hospitality sites that want a cleaner value story with stronger resilience.',
            imageUrl:
              'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=80',
          },
          {
            eyebrow: 'Commercial and SME',
            title:
              'Lower daytime electricity costs without forcing every client into upfront capex.',
            body:
              'Use PPA, lease or hybrid models to match the way Vietnamese businesses actually buy energy improvements.',
            imageUrl:
              'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1400&q=80',
          },
          {
            eyebrow: 'Operator software',
            title:
              'Unify sales promise, plant monitoring, invoices, payments and support in one stack.',
            body:
              'This is the operating layer premium energy brands imply, but many regional operators still miss in practice.',
            imageUrl:
              'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1400&q=80',
          },
        ],
        deliverySection: {
          eyebrow: 'Delivery path',
          title: 'How projects move from sale to live operations.',
          steps: [
            'Audit site load profile and usable roof area',
            'Recommend contract model and expected savings',
            'Install the system, connect monitoring and publish the customer portal',
            'Run monthly billing, collection and support from one admin cockpit',
          ],
        },
        packagesSection: {
          eyebrow: 'Commercial models',
          title:
            'The pricing cards below can be reused directly in your solution selling flow.',
        },
        nextStepCta: {
          eyebrow: 'Next step',
          title:
            'Choose the right solar model first, then let the platform handle the operating complexity.',
          primaryCta: {
            label: 'Compare pricing',
            href: '/pricing',
          },
          secondaryCta: {
            label: 'Speak to advisor',
            href: '/contact',
          },
        },
      },
    },
  },
  {
    key: 'contact',
    name: 'Liên hệ',
    description: 'Trang liên hệ public và thu thập yêu cầu tư vấn.',
    published: true,
    sortOrder: 50,
    content: {
      vi: {
        hero: {
          eyebrow: 'Liên hệ',
          title:
            'Trao đổi giải pháp vận hành, lập hóa đơn và cổng khách hàng cho danh mục điện mặt trời của bạn.',
          description:
            'Gửi nhanh thông tin danh mục dự án, mô hình thanh toán hiện tại và bài toán vận hành bạn đang vướng để đội ngũ tư vấn chuẩn bị đúng nội dung.',
        },
        contactCard: {
          eyebrow: 'Kênh liên hệ trực tiếp',
          title: 'Kết nối đội ngũ Moka Solar',
          hotline: '+84 28 7300 2026',
          email: 'hello@moka-solar.vn',
          office: 'Khu công nghệ Thủ Đức, TP. Hồ Chí Minh',
        },
        formSection: {
          eyebrow: 'Thông tin nhu cầu',
          title: 'Cho chúng tôi biết về danh mục khách hàng và hệ thống của bạn.',
          namePlaceholder: 'Tên công ty hoặc người liên hệ',
          emailPlaceholder: 'Email',
          companyPlaceholder: 'Tên doanh nghiệp',
          siteCountPlaceholder: 'Bạn đang vận hành bao nhiêu site?',
          messagePlaceholder:
            'Mô tả mô hình thanh toán, quy mô khách hàng và những vấn đề vận hành hiện tại.',
          submitLabel: 'Gửi yêu cầu tư vấn',
          successMessage:
            'Chúng tôi đã ghi nhận yêu cầu và sẽ liên hệ với bạn trong thời gian sớm nhất.',
        },
      },
      en: {
        hero: {
          eyebrow: 'Contact',
          title:
            'Talk to Moka Solar about billing, operations and customer service for your solar portfolio.',
          description:
            'Share your portfolio size, current billing model and operating pain points so the team can prepare the right consultation.',
        },
        contactCard: {
          eyebrow: 'Direct channels',
          title: 'Reach the Moka Solar team',
          hotline: '+84 28 7300 2026',
          email: 'hello@moka-solar.vn',
          office: 'Thu Duc Tech Hub, Ho Chi Minh City',
        },
        formSection: {
          eyebrow: 'Project brief',
          title: 'Tell us about your portfolio and operating model.',
          namePlaceholder: 'Company or contact name',
          emailPlaceholder: 'Email',
          companyPlaceholder: 'Company name',
          siteCountPlaceholder: 'How many sites do you operate?',
          messagePlaceholder:
            'Describe your billing model, customer volume and current operating pain points.',
          submitLabel: 'Request consultation',
          successMessage:
            'Your consultation brief has been prepared for email. Please confirm sending it from your mail app.',
        },
      },
    },
  },
];
