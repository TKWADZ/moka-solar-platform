import {
  AboutPageContent,
  ContactPageContent,
  HomePageContent,
  MarketingLocale,
  MarketingPageContentByKey,
  MarketingPageKey,
  MarketingPageRecord,
  PricingPageContent,
  SolutionsPageContent,
} from '@/types';
import {
  defaultContactEn,
  defaultContactVi,
  defaultSolutionsEn,
  defaultSolutionsVi,
} from '@/data/marketing-cms-extra';

const nowIso = new Date().toISOString();

const defaultHomeVi: HomePageContent = {
  hero: {
    eyebrow: 'Điện mặt trời cao cấp cho thị trường Việt Nam',
    title: 'Một nền tảng bán hàng, vận hành và thu tiền điện mặt trời trong cùng một trải nghiệm đẹp.',
    description:
      'Từ bước báo giá đầu tiên đến hóa đơn hàng tháng, Moka Solar giúp đội ngũ bán hàng và vận hành cùng nhìn một dữ liệu thật, gọn và dễ chốt khách.',
    imageUrl:
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1800&q=80',
    primaryCta: {
      label: 'Nhận tư vấn giải pháp',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Xem các mô hình triển khai',
      href: '/solutions',
    },
    featureCard: {
      eyebrow: 'Nhà ở + doanh nghiệp nhỏ',
      title: 'Điện mặt trời, pin lưu trữ và khả năng dự phòng trong một gói thống nhất.',
    },
    miniCards: [
      {
        eyebrow: 'Mái thương mại',
        title: 'Hỗ trợ PPA, thuê hệ thống, hybrid và trả góp theo đúng dòng tiền khách Việt.',
      },
      {
        eyebrow: 'Vận hành',
        title: 'Đồng bộ SEMS, hóa đơn PDF, lịch sử thanh toán và yêu cầu hỗ trợ trên cùng một cổng khách hàng.',
      },
    ],
    metricCard: {
      eyebrow: 'Lợi thế vận hành',
      value: '31.8%',
      body: 'Biên lợi nhuận kỳ vọng rõ hơn khi lập hóa đơn, thu tiền và chăm sóc khách hàng đi chung một hệ thống.',
      ctaLabel: 'Mở dashboard vận hành',
      ctaHref: '/admin',
    },
  },
  stats: [
    {
      title: 'Sản lượng được quản lý',
      value: '1.82 GWh',
      subtitle: 'Danh mục hệ thống mái nhà, villa và nhà xưởng đang được theo dõi tập trung.',
    },
    {
      title: 'Tỷ lệ thu tiền đúng hạn',
      value: '96.4%',
      subtitle: 'Khả năng thu tiền tốt hơn trên các hợp đồng PPA, lease và hybrid định kỳ.',
    },
    {
      title: 'Hợp đồng đang hoạt động',
      value: '248',
      subtitle: 'Nhiều mô hình thương mại có thể triển khai trên cùng một nền tảng.',
    },
    {
      title: 'Tiết kiệm trung bình',
      value: '3.280.000 VND',
      subtitle: 'Mức tiết kiệm điện mỗi tháng điển hình so với mua điện lưới hoàn toàn.',
    },
  ],
  teslaSection: {
    eyebrow: 'Chuẩn trải nghiệm',
    title: 'Website năng lượng cần tạo cảm giác rõ ràng, đáng tin và giàu dữ liệu ngay từ màn đầu tiên.',
    buttonLabel: 'Xem các giải pháp triển khai',
    buttonHref: '/solutions',
  },
  storyPanels: [
    {
      eyebrow: 'Năng lượng cho nhà ở',
      title: 'Lưu trữ điện ban ngày và giữ ngôi nhà vận hành mượt sau khi mặt trời lặn.',
      body: 'Kể một câu chuyện bán hàng liền mạch giữa điện mặt trời, khả năng sẵn sàng cho pin lưu trữ và trải nghiệm cổng khách hàng cao cấp.',
      imageUrl:
        'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=1400&q=80',
    },
    {
      eyebrow: 'Tiết kiệm cho doanh nghiệp',
      title: 'Cho quán cà phê, villa, trường học và nhà xưởng một lối đi rõ ràng để giảm hóa đơn điện.',
      body: 'Chọn đúng mô hình thanh toán thay vì ép mọi khách hàng phải đầu tư một lần ngay từ đầu.',
      imageUrl:
        'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1400&q=80',
    },
    {
      eyebrow: 'Phần mềm vận hành',
      title: 'Đi từ bảng tính rời rạc sang một hệ điều hành thật cho hóa đơn, thanh toán và hỗ trợ.',
      body: 'Cổng khách hàng, trung tâm điều hành và dữ liệu inverter cùng chia sẻ một sự thật vận hành duy nhất.',
      imageUrl:
        'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1400&q=80',
    },
  ],
  improvementCard: {
    eyebrow: 'Website đã được nâng cấp',
    title: 'Trải nghiệm công khai đã được tinh gọn để phù hợp một thương hiệu năng lượng cao cấp và đáng tin cậy.',
    signals: [
      'Headline ngắn, mạnh và đi thẳng vào giá trị bán hàng',
      'Khối visual lớn giúp điện mặt trời trông cao cấp hơn',
      'CTA báo giá xuất hiện sớm để khách hàng hình dung bước tiếp theo',
      'Tách rõ câu chuyện cho nhà ở, thương mại và phần mềm vận hành',
    ],
  },
  switchCard: {
    eyebrow: 'Vì sao các đội ngũ chuyển sang mô hình này',
    title: 'Một nền tảng duy nhất mang cả hành trình từ lời hứa bán hàng đến kỳ thu tiền hằng tháng.',
    before: {
      label: 'Trước đây',
      body: 'Website giới thiệu, báo giá, hợp đồng, hóa đơn và hỗ trợ nằm trên nhiều công cụ rời rạc.',
    },
    after: {
      label: 'Bây giờ',
      body: 'Nhân viên có thể đăng bài, tạo hóa đơn, theo dõi inverter và phản hồi yêu cầu hỗ trợ từ cùng một nền tảng.',
    },
    bestFit: {
      label: 'Phù hợp nhất',
      body: 'Doanh nghiệp điện mặt trời Việt Nam muốn tạo ấn tượng cao cấp nhưng vẫn vận hành linh hoạt và gọn gàng.',
    },
  },
  packagesSection: {
    eyebrow: 'Các mô hình thương mại',
    title: 'Chọn mô hình hợp đồng đúng với dòng tiền của từng khách hàng.',
    buttonLabel: 'Xem bảng giá',
    buttonHref: '/pricing',
  },
  newsroomSection: {
    eyebrow: 'Nội dung thực chiến',
    title: 'Xuất bản case study, nội dung sales và ghi chú vận hành ngay từ cùng một hệ thống.',
    buttonLabel: 'Mở newsroom',
    buttonHref: '/news',
  },
  closingCta: {
    eyebrow: 'Sẵn sàng bán hàng',
    title: 'Cho khách hàng một câu chuyện năng lượng gọn đẹp hơn và cho đội ngũ một bộ khung vận hành sống ngay từ ngày đầu.',
    primaryCta: {
      label: 'Nhận tư vấn triển khai',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Đăng nhập khách hàng',
      href: '/login',
    },
  },
};

const defaultHomeEn: HomePageContent = {
  hero: {
    eyebrow: 'Premium solar operating system for Vietnam',
    title: 'Sell, operate and collect rooftop solar with one polished customer experience.',
    description:
      'From the first quote to recurring monthly invoices, Moka Solar gives sales, finance and operations one shared source of truth.',
    imageUrl:
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1800&q=80',
    primaryCta: {
      label: 'Request consultation',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Explore solution tracks',
      href: '/solutions',
    },
    featureCard: {
      eyebrow: 'Home + SMB',
      title: 'Solar, storage readiness and outage resilience in one elegant package.',
    },
    miniCards: [
      {
        eyebrow: 'Commercial roofs',
        title: 'Support PPA, lease, hybrid and installment models that match Vietnam cashflows.',
      },
      {
        eyebrow: 'Operations',
        title: 'SEMS sync, invoice PDF, payment history and support requests in one customer portal.',
      },
    ],
    metricCard: {
      eyebrow: 'Operator advantage',
      value: '31.8%',
      body: 'Expected margin visibility improves when invoicing, collection and customer care stay on one system.',
      ctaLabel: 'Open operations dashboard',
      ctaHref: '/admin',
    },
  },
  stats: [
    {
      title: 'Managed generation',
      value: '1.82 GWh',
      subtitle: 'Portfolio output across rooftop, villa and factory sites under one operating layer.',
    },
    {
      title: 'Collection health',
      value: '96.4%',
      subtitle: 'Recurring payment performance across PPA, lease and hybrid contracts.',
    },
    {
      title: 'Active contracts',
      value: '248',
      subtitle: 'Multiple commercial models running inside one platform.',
    },
    {
      title: 'Average savings',
      value: '3,280,000 VND',
      subtitle: 'Typical monthly customer savings compared with full grid consumption.',
    },
  ],
  teslaSection: {
    eyebrow: 'Experience benchmark',
    title: 'An energy website should feel clear, credible and data-rich from the first screen.',
    buttonLabel: 'Explore solution tracks',
    buttonHref: '/solutions',
  },
  storyPanels: [
    {
      eyebrow: 'Residential energy',
      title: 'Store daytime solar and keep homes running after the sun goes down.',
      body: 'Unify solar production, battery readiness and a polished homeowner reporting experience in one sales story.',
      imageUrl:
        'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=1400&q=80',
    },
    {
      eyebrow: 'Commercial savings',
      title: 'Give cafes, villas, schools and factories a cleaner path away from rising electricity bills.',
      body: 'Match each project to the right payment model instead of forcing the same upfront capex decision.',
      imageUrl:
        'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1400&q=80',
    },
    {
      eyebrow: 'Operator software',
      title: 'Move from scattered spreadsheets to a real operating system for invoices, payments and support.',
      body: 'Customer portal, operations center and inverter data now share the same operational truth.',
      imageUrl:
        'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1400&q=80',
    },
  ],
  improvementCard: {
    eyebrow: 'What changed',
    title: 'The public experience now feels closer to a premium energy brand than a generic SaaS demo.',
    signals: [
      'Shorter and bolder headlines focused on the buying story',
      'Large visual panels that make solar feel premium',
      'Faster quote-oriented calls to action',
      'Cleaner segmentation between home, commercial and operations software',
    ],
  },
  switchCard: {
    eyebrow: 'Why teams switch',
    title: 'One platform now carries the journey from sales promise to monthly collection.',
    before: {
      label: 'Before',
      body: 'Landing page, quote flow, contracts, invoices and support lived in separate tools.',
    },
    after: {
      label: 'After',
      body: 'Staff can publish content, generate invoices, monitor systems and reply to support requests from one platform.',
    },
    bestFit: {
      label: 'Best fit',
      body: 'Vietnam solar companies that want to look premium while operating at startup speed.',
    },
  },
  packagesSection: {
    eyebrow: 'Commercial models',
    title: 'Choose the contract structure that matches each customer cashflow.',
    buttonLabel: 'Open pricing page',
    buttonHref: '/pricing',
  },
  newsroomSection: {
    eyebrow: 'Field content',
    title: 'Publish case studies, sales education and operating notes from the same platform.',
    buttonLabel: 'Open newsroom',
    buttonHref: '/news',
  },
  closingCta: {
    eyebrow: 'Ready to sell',
    title: 'Give customers a cleaner energy story and give your team a live operating backbone on day one.',
    primaryCta: {
      label: 'Request consultation',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Customer sign in',
      href: '/login',
    },
  },
};

const defaultAboutVi: AboutPageContent = {
  hero: {
    eyebrow: 'Về Moka Solar',
    title: 'Một lớp phần mềm cho các công ty điện mặt trời muốn vừa bán đẹp vừa vận hành chặt.',
    description:
      'Chúng tôi xây một trải nghiệm vừa mang cảm giác thương hiệu cao cấp, vừa đủ thực tế để đội sales, kế toán và vận hành chạy hàng ngày.',
  },
  cards: [
    {
      eyebrow: 'Bài toán thương mại',
      title: 'Tập trung vào doanh thu và trải nghiệm khách hàng',
      body: 'Nhiều đội ngũ điện mặt trời làm tốt phần kỹ thuật nhưng khâu lập hóa đơn, hợp đồng và hỗ trợ khách vẫn bị phân mảnh. Moka Solar gom các quy trình đó lại.',
    },
    {
      eyebrow: 'Nguyên tắc thiết kế',
      title: 'Cao cấp nhưng không rối',
      body: 'Giao diện theo hướng tối giản và cao cấp: ít chi tiết thừa, số liệu lớn, biểu đồ rõ và vẫn đẹp trên desktop lẫn mobile.',
    },
    {
      eyebrow: 'Kiến trúc',
      title: 'Sinh ra để mở rộng',
      body: 'Cùng backend này có thể mở rộng sang mobile app, inverter API thật, nhắc nợ qua Zalo hoặc SMS và mô hình multi-tenant trong tương lai.',
    },
  ],
};

const defaultAboutEn: AboutPageContent = {
  hero: {
    eyebrow: 'About Moka Solar',
    title: 'A software layer for solar companies that want premium customer trust and tighter operations.',
    description:
      'We designed a product experience that looks polished enough for sales, while staying practical enough for finance and operations to run every day.',
  },
  cards: [
    {
      eyebrow: 'Commercial challenge',
      title: 'Focus on revenue and customer experience',
      body: 'Many solar teams execute well on engineering but still run fragmented invoicing, support and contract workflows. Moka Solar brings those pieces together.',
    },
    {
      eyebrow: 'Design principle',
      title: 'Premium without clutter',
      body: 'The interface is intentionally minimal: large numbers, confident spacing, calm hierarchy and a mobile-friendly premium feel.',
    },
    {
      eyebrow: 'Architecture',
      title: 'Built to expand',
      body: 'The same backend can grow into mobile apps, real inverter integrations, Zalo or SMS reminders and future multi-tenant operations.',
    },
  ],
};

const defaultPricingVi: PricingPageContent = {
  hero: {
    eyebrow: 'Bảng giá và mô hình dịch vụ',
    title: 'Định giá điện mặt trời theo đúng cách khách hàng Việt thực sự mua: theo kWh, theo tháng hoặc theo lộ trình sở hữu.',
    description:
      'Trang bảng giá giữ thông điệp ngắn gọn, rõ ràng và vẫn phản ánh được độ linh hoạt tài chính của hệ thống phía sau.',
  },
  offers: [
    {
      contractType: 'PPA / kWh',
      name: 'PPA Premium Rooftop',
      badge: 'Linh hoạt nhất',
      summary: 'Phù hợp cho quán cà phê, văn phòng và doanh nghiệp vừa muốn giảm hóa đơn điện mà không cần vốn đầu tư ban đầu quá lớn.',
      highlights: [
        'Tính tiền điện hàng tháng theo kWh',
        'Có cấu hình tăng giá theo năm',
        'Đã bao gồm bảo trì vận hành',
      ],
      pricing: 'Từ 2.250 VND / kWh',
    },
    {
      contractType: 'Thuê cố định',
      name: 'Lease Flex 36',
      badge: 'Dễ dự toán dòng tiền',
      summary: 'Phí thuê cố định hàng tháng đi kèm cam kết vận hành ổn định và bảo trì trọn gói.',
      highlights: [
        'Phí thuê cố định theo tháng',
        'Kỳ hạn 36 tháng',
        'Phù hợp cho villa và mô hình lưu trú cao cấp',
      ],
      pricing: 'Từ 6,5 triệu VND / tháng',
    },
    {
      contractType: 'Hybrid',
      name: 'Hybrid Commerce',
      badge: 'Cho tải tiêu thụ lớn',
      summary: 'Mô hình kết hợp phí nền tảng cố định và phí điện năng cho nhà xưởng và mái thương mại.',
      highlights: [
        'Phí cố định cộng sản lượng tiêu thụ',
        'Có thể cấu hình điện dư trả lưới',
        'Phù hợp cho site tiêu thụ cao',
      ],
      pricing: '4,2 triệu + 1.850 VND / kWh',
    },
    {
      contractType: 'Trả góp',
      name: 'Installment 24M',
      badge: 'Lộ trình sở hữu',
      summary: 'Khách hàng sở hữu hệ thống theo thời gian với gốc, lãi và phí dịch vụ gộp trong cùng lịch thanh toán.',
      highlights: [
        'Lộ trình 24 tháng',
        'Gồm gốc + lãi + dịch vụ',
        'Phù hợp khi muốn sở hữu tài sản',
      ],
      pricing: 'Từ 9,8 triệu VND / tháng',
    },
  ],
  notesSection: {
    eyebrow: 'Các chính sách tài chính sẵn có',
    title: 'Hệ thống đã hỗ trợ các cấu hình tài chính quan trọng để đưa vào vận hành thật.',
    notes: [
      'VAT và tăng giá hàng năm có thể cấu hình theo từng gói',
      'Phạt trễ hạn và chiết khấu thanh toán sớm đã có trong công cụ lập hóa đơn',
      'Hóa đơn được sinh theo tháng và xuất PDF',
      'Khách hàng có thể xem hóa đơn và lịch sử thanh toán ngay trong cổng khách hàng',
    ],
  },
  ctaCard: {
    eyebrow: 'Sự tự tin khi bán hàng',
    title: 'Trang bảng giá cần trả lời câu hỏi “bán thế nào?” nhanh như dashboard trả lời “vận hành ra sao?”.',
    description:
      'Bạn có thể trình bày rõ mô hình tài chính với khách hàng mà vẫn giữ phần backend đủ mạnh cho vận hành thực tế.',
    primaryCta: {
      label: 'Nhận đề xuất',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Đăng nhập',
      href: '/login',
    },
  },
};

const defaultPricingEn: PricingPageContent = {
  hero: {
    eyebrow: 'Pricing and packaging',
    title: 'Price solar the way Vietnamese customers actually buy: by kWh, by month or by ownership path.',
    description:
      'The pricing story stays clean and premium on the surface while still matching the billing flexibility already running underneath the product.',
  },
  offers: [
    {
      contractType: 'PPA / kWh',
      name: 'PPA Premium Rooftop',
      badge: 'Most flexible',
      summary: 'Ideal for cafes, offices and SMEs that want lower monthly electricity costs without upfront capex.',
      highlights: [
        'Monthly energy billing per kWh',
        'Annual escalation controls',
        'Maintenance included',
      ],
      pricing: 'From 2,250 VND / kWh',
    },
    {
      contractType: 'Fixed lease',
      name: 'Lease Flex 36',
      badge: 'Predictable cashflow',
      summary: 'A fixed monthly subscription bundled with uptime service and maintenance.',
      highlights: [
        'Flat monthly fee',
        '36-month term',
        'Strong fit for villas and hospitality',
      ],
      pricing: 'From 6.5M VND / month',
    },
    {
      contractType: 'Hybrid',
      name: 'Hybrid Commerce',
      badge: 'High-consumption sites',
      summary: 'Blended pricing for factories and commercial roofs that need both a base fee and usage billing.',
      highlights: [
        'Base fee plus usage billing',
        'Optional export settlement',
        'Built for higher daily load',
      ],
      pricing: '4.2M base + 1,850 VND / kWh',
    },
    {
      contractType: 'Installment',
      name: 'Installment 24M',
      badge: 'Ownership path',
      summary: 'Customers own the system over time through one repayment schedule covering principal, interest and service.',
      highlights: [
        '24-month schedule',
        'Principal + interest + service',
        'Strong fit for asset ownership',
      ],
      pricing: 'From 9.8M VND / month',
    },
  ],
  notesSection: {
    eyebrow: 'Billing rules already supported',
    title: 'The platform already includes the key financial controls required for live operations.',
    notes: [
      'VAT and annual price escalation can be configured per package',
      'Late fee and early payment discount logic already exists',
      'Invoices can be generated monthly and exported as PDF',
      'Customers can review invoices and payment history directly in the portal',
    ],
  },
  ctaCard: {
    eyebrow: 'Commercial confidence',
    title: 'A pricing page should answer “how do we sell this?” as fast as the dashboard answers “how do we run it?”.',
    description:
      'Explain the commercial model clearly to buyers while keeping the backend strong enough for real operational execution.',
    primaryCta: {
      label: 'Request proposal',
      href: '/contact',
    },
    secondaryCta: {
      label: 'Sign in',
      href: '/login',
    },
  },
};

const defaultPageContent: MarketingPageContentByKey = {
  home: defaultHomeEn,
  about: defaultAboutEn,
  pricing: defaultPricingEn,
  solutions: defaultSolutionsEn,
  contact: defaultContactEn,
};

const localizedDefaults: Record<MarketingPageKey, Record<MarketingLocale, MarketingPageContentByKey[MarketingPageKey]>> = {
  home: { vi: defaultHomeVi, en: defaultHomeEn },
  about: { vi: defaultAboutVi, en: defaultAboutEn },
  pricing: { vi: defaultPricingVi, en: defaultPricingEn },
  solutions: { vi: defaultSolutionsVi, en: defaultSolutionsEn },
  contact: { vi: defaultContactVi, en: defaultContactEn },
};

const pageMeta: Record<MarketingPageKey, Pick<MarketingPageRecord, 'name' | 'description' | 'published' | 'sortOrder'>> = {
  home: {
    name: 'Trang chủ',
    description: 'Trang landing page chính cho thương hiệu năng lượng mặt trời.',
    published: true,
    sortOrder: 10,
  },
  about: {
    name: 'Giới thiệu',
    description: 'Trang giới thiệu công ty và định vị sản phẩm.',
    published: true,
    sortOrder: 20,
  },
  pricing: {
    name: 'Bảng giá',
    description: 'Trang bảng giá công khai với các gói và thông điệp bán hàng.',
    published: true,
    sortOrder: 30,
  },
  solutions: {
    name: 'Giải pháp',
    description: 'Trang giai phap theo tung nhom khach hang va mo hinh trien khai.',
    published: true,
    sortOrder: 40,
  },
  contact: {
    name: 'Liên hệ',
    description: 'Trang lien he public va thu thap yeu cau tu van tu website.',
    published: true,
    sortOrder: 50,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const copyCleanupMap: Array<[string, string]> = [
  ['Open demo workspace', 'Đăng nhập'],
  ['Mở demo workspace', 'Đăng nhập'],
  ['Start demo', 'Nhận tư vấn'],
  ['Tạo tài khoản demo', 'Yêu cầu tư vấn'],
  ['Create demo account', 'Request consultation'],
  ['Create a demo account', 'Request consultation'],
  ['Create a demo customer account', 'Yêu cầu cấp tài khoản'],
  ['Open live portal', 'Đăng nhập'],
  ['Open live portals', 'Đăng nhập'],
  ['Mở các portal vận hành', 'Đăng nhập'],
  ['https://www.tesla.com/energy', '/solutions'],
  ['Xem cảm hứng Tesla Energy', 'Xem giải pháp triển khai'],
  ['See Tesla Energy reference', 'Explore solution tracks'],
  [
    'Bản public hiện đi gần hơn với một premium energy brand thay vì một bản demo SaaS.',
    'Trải nghiệm công khai đã được tinh gọn để phù hợp một thương hiệu năng lượng cao cấp và đáng tin cậy.',
  ],
  [
    'The public experience now feels closer to a premium energy brand than a generic SaaS demo.',
    'The public experience is now cleaner, calmer and more credible for a real energy brand.',
  ],
  [
    'Đặt lịch demo nền tảng cho đội sales, tài chính và vận hành điện mặt trời của bạn.',
    'Trao đổi giải pháp với đội ngũ Moka Solar cho nhu cầu bán hàng, vận hành và chăm sóc khách hàng.',
  ],
  [
    'Book a platform demo for your solar sales, finance and operations teams.',
    'Talk to Moka Solar about onboarding, billing and operations for your portfolio.',
  ],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanupCopy(value: string) {
  return copyCleanupMap.reduce((output, [from, to]) => output.replaceAll(from, to), value);
}

function sanitizeContent<T>(value: T): T {
  if (typeof value === 'string') {
    return cleanupCopy(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContent(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeContent(item)]),
    ) as T;
  }

  return value;
}

function deepMerge<T>(base: T, incoming: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(incoming) ? incoming : base) as T;
  }

  if (!isPlainObject(base)) {
    return (incoming === undefined || incoming === null ? base : incoming) as T;
  }

  const output: Record<string, unknown> = { ...base };
  const source = isPlainObject(incoming) ? incoming : {};

  for (const key of Object.keys(output)) {
    output[key] = deepMerge(output[key], source[key]);
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in output)) {
      output[key] = value;
    }
  }

  return output as T;
}

export function buildDefaultMarketingPages(): MarketingPageRecord[] {
  return (Object.keys(pageMeta) as MarketingPageKey[]).map((key) => ({
    id: `default-${key}`,
    key,
    ...pageMeta[key],
    content: {
      vi: clone(localizedDefaults[key].vi),
      en: clone(localizedDefaults[key].en),
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  }));
}

export function normalizeMarketingPages(pages: MarketingPageRecord[] = []) {
  const defaults = buildDefaultMarketingPages();

  return defaults.map((fallback) => {
    const existing = pages.find((page) => page.key === fallback.key);

    if (!existing) {
      return fallback;
    }

    return {
      ...fallback,
      ...existing,
      content: {
        vi: deepMerge(localizedDefaults[fallback.key].vi, existing.content?.vi),
        en: deepMerge(localizedDefaults[fallback.key].en, existing.content?.en),
      },
    };
  });
}

export function resolveMarketingPageContent<K extends MarketingPageKey>(
  pages: MarketingPageRecord[],
  key: K,
  locale: MarketingLocale,
): MarketingPageContentByKey[K] {
  const normalized = normalizeMarketingPages(pages);
  const page = normalized.find((item) => item.key === key);

  if (!page) {
    return sanitizeContent(clone(localizedDefaults[key][locale])) as MarketingPageContentByKey[K];
  }

  return sanitizeContent(
    clone(page.content[locale] || page.content.vi || defaultPageContent[key]),
  ) as MarketingPageContentByKey[K];
}
