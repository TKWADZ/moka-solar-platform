export type PublicNavigationItem = {
  href: string;
  label: string;
  featureKey?: string;
};

export type FooterLink = {
  label: string;
  href: string;
};

export type FooterSection = {
  title: string;
  href?: string;
  links: FooterLink[];
};

export type SalesDetailContent = {
  eyebrow: string;
  title: string;
  summary: string;
  fitLabel: string;
  fitBody: string;
  pricingLabel: string;
  pricingBody: string;
  exampleLabel: string;
  exampleBody: string;
  benefits: string[];
  operations: string[];
  support: string;
  process: string[];
  ctaTopic: string;
};

export type PublicSalesModel = {
  id: string;
  contractType: string;
  name: string;
  badge: string;
  summary: string;
  highlights: string[];
  pricing: string;
  detail: SalesDetailContent;
};

export type PublicSolutionTrack = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  imageUrl: string;
  detail: SalesDetailContent;
};

export type HomepageBenefit = {
  title: string;
  body: string;
};

export type HomepageTrustPoint = {
  title: string;
  body: string;
};

export type HomepageCaseStudy = {
  title: string;
  segment: string;
  capacity: string;
  result: string;
  body: string;
  imageUrl: string;
};

export type HomepageFaq = {
  question: string;
  answer: string;
};

export type ManualPaymentRail = {
  key?: string;
  label: string;
  accountName: string;
  accountNumber: string;
  providerName: string;
  branch?: string;
  qrImage?: string;
  noteTemplate: string;
  isEnabled?: boolean;
  sortOrder?: number;
  isDefault?: boolean;
  supportsVietQr?: boolean;
  vietQrBankId?: string;
};

export type PublicPricingPolicy = {
  estimatedPaybackYears: number;
  evnReferenceLabel: string;
  evnHighestTierPrice: number;
  evnHighestTierLabel: string;
  mokaReferencePrice: number;
  mokaReferenceLabel: string;
  mokaReferenceNote: string;
  billingRuleLabel: string;
  billingRuleNote: string;
};

const rawPublicSiteConfig = {
  brand: {
    name: "Moka Solar",
    legalName: "Công ty TNHH Truyền thông Moka",
    platformLabel:
      "Dịch vụ điện mặt trời cao cấp cho công trình dân dụng và thương mại",
    logo: {
      src: "/brand/logo-moka-solar.png",
      alt: "Moka Solar",
    },
    media: {
      favicon: "/brand/logo-moka-solar.png",
      ogImage: "/brand/moka-premium-rooftop.jpg",
    },
  },
  navigation: {
    headerLinks: [
      { href: "/", label: "Trang chủ", featureKey: "marketing_pages" },
      { href: "/solutions", label: "Giải pháp", featureKey: "marketing_pages" },
      { href: "/pricing", label: "Bảng giá", featureKey: "marketing_pages" },
      { href: "/operations", label: "Vận hành", featureKey: "marketing_pages" },
      { href: "/news", label: "Tin tức", featureKey: "content_posts" },
      { href: "/contact", label: "Liên hệ", featureKey: "marketing_pages" },
    ] satisfies PublicNavigationItem[],
  },
  contact: {
    companyLabel: "Moka Solar",
    legalCompanyLabel: "Công ty TNHH Truyền thông Moka",
    hotlineLabel: "0342608192",
    hotlineHref: "tel:0342608192",
    emailLabel: "mokamediacompany@gmail.com",
    emailHref: "mailto:mokamediacompany@gmail.com",
    addressLabel:
      "11A Đường 2, Khu đô thị Vạn Phúc, phường Hiệp Bình, TP. Hồ Chí Minh",
    businessHoursLabel: "Giờ làm việc: 8h đến 17h",
    serviceAreaLabel:
      "Phục vụ khách hàng tại TP. Hồ Chí Minh và các tỉnh lân cận theo từng dự án.",
    zaloHref: "https://zalo.me/0342608192",
    whatsappHref: "",
    messengerHref: "",
    facebookHref: "",
    tiktokHref: "",
    contactPageHref: "/contact",
  },
  payments: {
    manual: {
      eyebrow: "Thanh toán thủ công",
      title: "Thông tin chuyển khoản và ví điện tử được đội vận hành xác nhận trực tiếp.",
      description:
        "Trong giai đoạn chưa bật thanh toán tự động, khách hàng có thể chuyển khoản hoặc thanh toán qua ví điện tử theo thông tin dưới đây. Sau khi giao dịch, vui lòng gửi biên lai để đội vận hành đối soát nhanh hơn.",
      rails: [
        {
          key: "BANK_TRANSFER",
          label: "Chuyển khoản ngân hàng",
          accountName: "CONG TY TNHH TRUYEN THONG MOKA",
          accountNumber: "0342608192",
          providerName: "Ngân hàng TMCP Quân đội (MB Bank)",
          branch: "Chi nhánh TP. Hồ Chí Minh",
          qrImage: "",
          noteTemplate: "MOKA {{invoiceNumber}} {{customerCode}}",
          isEnabled: true,
          sortOrder: 1,
          isDefault: true,
          supportsVietQr: true,
          vietQrBankId: "mbbank",
        },
        {
          key: "MOMO_QR",
          label: "Ví điện tử MoMo",
          accountName: "Moka Solar",
          accountNumber: "0342608192",
          providerName: "MoMo",
          branch: "",
          qrImage: "",
          noteTemplate: "MOKA {{invoiceNumber}}",
          isEnabled: true,
          sortOrder: 2,
          isDefault: false,
          supportsVietQr: false,
        },
      ] satisfies ManualPaymentRail[],
      confirmationTitle: "Sau khi thanh toán, vui lòng gửi biên lai để xác nhận nhanh hơn.",
      confirmationBody:
        "Bạn có thể gửi biên lai chuyển khoản qua Zalo hoặc liên hệ trực tiếp với đội vận hành để được đối soát trong giờ làm việc.",
    },
  },
  ctas: {
    consultation: {
      label: "Nhận tư vấn cho công trình của tôi",
      href: "/contact",
    },
    login: {
      label: "Đăng nhập hệ thống",
      href: "/login",
    },
    pricing: {
      label: "Xem mô hình giá",
      href: "/pricing",
    },
    operations: {
      label: "Xem cách vận hành",
      href: "/operations",
    },
  },
  pricingPolicy: {
    estimatedPaybackYears: 3,
    evnReferenceLabel: "Giá điện EVN",
    evnHighestTierPrice: 3460,
    evnHighestTierLabel:
      "Dùng biểu giá EVN mới nhất, tham chiếu theo bậc giá cao nhất.",
    mokaReferencePrice: 2500,
    mokaReferenceLabel: "2.500 đ/kWh, chưa gồm VAT",
    mokaReferenceNote:
      "Đây là mức tham chiếu theo chính sách Moka, khoảng 75% mức giá EVN cao nhất.",
    billingRuleLabel: "Quy tắc tính tiền",
    billingRuleNote:
      "Số điện tính tiền = tổng sản lượng điện mặt trời tạo ra theo tháng.",
  } satisfies PublicPricingPolicy,
  homepage: {
    hero: {
      eyebrow: "Giải pháp điện mặt trời rõ chi phí, gọn vận hành",
      title:
        "Xem nhanh công suất gợi ý, sản lượng PV tháng và mức thanh toán theo chính sách Moka.",
      description:
        "Moka Solar tư vấn và triển khai điện mặt trời theo mô hình thuê hệ thống, PPA, trả góp và hybrid có lưu trữ. Phù hợp cho villa, homestay, quán cà phê, nhà hàng và doanh nghiệp cần một giải pháp cao cấp, rõ chi phí và dễ theo dõi sau lắp đặt.",
      highlights: [
        "Tiết kiệm tham khảo 20% đến 40% chi phí điện ban ngày",
        "Mức tham chiếu 2.500 đ/kWh, chưa gồm VAT",
        "Theo dõi sản lượng, hóa đơn và hỗ trợ trên một portal riêng",
      ],
      primaryCtaLabel: "Nhận tư vấn nhanh",
      secondaryCtaLabel: "Chat Zalo ngay",
      tertiaryCtaLabel: "Gọi hotline",
      metricCards: [
        {
          label: "Mức tiết kiệm tham khảo",
          value: "20% - 40%",
          body: "Tùy loại công trình, phụ tải và khung giá tiêu thụ điện.",
        },
        {
          label: "Mô hình thanh toán",
          value: "4 lựa chọn",
          body: "Thuê hệ thống, PPA, trả góp hoặc hybrid có lưu trữ.",
        },
        {
          label: "Phản hồi tư vấn",
          value: "Trong ngày",
          body: "Đội ngũ tiếp nhận yêu cầu trong giờ làm việc 8h đến 17h.",
        },
      ],
      visualCards: [
        {
          label: "Khách hàng mục tiêu",
          title: "Villa, homestay, quán cà phê, nhà hàng và doanh nghiệp nhỏ",
        },
        {
          label: "Trải nghiệm vận hành",
          title: "Portal riêng để xem sản lượng, hóa đơn và lịch sử hỗ trợ",
        },
      ],
      visualStats: [
        {
          label: "Công trình tiêu biểu",
          value: "12 - 75 kWp",
        },
        {
          label: "Mô hình triển khai",
          value: "Thuê, PPA, hybrid",
        },
      ],
    },
    benefits: [
      {
        title: "Không ép khách theo một mô hình duy nhất",
        body: "Mỗi công trình được tư vấn theo dòng tiền, phụ tải và mục tiêu vận hành thực tế.",
      },
      {
        title: "Dễ hiểu cho người ra quyết định",
        body: "Báo giá, lộ trình triển khai và phần tiết kiệm được trình bày gọn, rõ và dễ so sánh.",
      },
      {
        title: "Có lớp vận hành sau lắp đặt",
        body: "Khách hàng theo dõi hệ thống, hóa đơn và yêu cầu hỗ trợ trên cùng một trải nghiệm thống nhất.",
      },
    ] satisfies HomepageBenefit[],
    companyStory: {
      eyebrow: "Vì sao chọn Moka Solar",
      title:
        "Một thương hiệu dịch vụ năng lượng được xây để đi cùng khách hàng sau ngày nghiệm thu.",
      body:
        "Moka Solar là thương hiệu điện mặt trời do Công ty TNHH Truyền thông Moka phát triển. Chúng tôi tập trung vào phương án rõ ràng, cấu trúc tài chính linh hoạt và khả năng chăm sóc sau triển khai để phục vụ khách hàng lâu dài.",
      trustPoints: [
        {
          title: "Bài toán tài chính được nói rõ ngay từ đầu",
          body: "Khách hàng nhìn thấy cách tính tiền, phần tiết kiệm và trách nhiệm vận hành trước khi quyết định.",
        },
        {
          title: "Thiết kế phù hợp nhóm khách hàng cao cấp",
          body: "Ưu tiên công trình villa, homestay, quán cà phê, nhà hàng và SME cần một phương án rõ ràng, đáng tin và dễ đi vào triển khai.",
        },
        {
          title: "Có lớp báo cáo và hỗ trợ sau bán hàng",
          body: "Từ sản lượng, hóa đơn đến ticket hỗ trợ đều được tổ chức theo một quy trình rõ ràng.",
        },
        {
          title: "Dễ mở rộng khi danh mục công trình tăng lên",
          body: "Hệ thống đã sẵn sàng cho việc theo dõi nhiều site và nhiều mô hình hợp đồng trong tương lai.",
        },
      ] satisfies HomepageTrustPoint[],
    },
    caseStudies: {
      eyebrow: "Tình huống triển khai tham khảo",
      title: "Ba kịch bản tiêu biểu để hình dung nhanh mức phù hợp trước buổi khảo sát.",
      description:
        "Các số liệu dưới đây là ví dụ tham khảo để khách hàng hình dung phương án phù hợp theo từng loại công trình.",
      items: [
        {
          title: "Biệt thự tại Vạn Phúc",
          segment: "Nhà ở cao cấp",
          capacity: "12,4 kWp",
          result: "Giảm khoảng 6,8 triệu đồng mỗi tháng vào mùa nắng",
          body: "Phù hợp với chủ nhà muốn giảm hóa đơn điện nhưng vẫn giữ công trình gọn, đẹp và dễ theo dõi.",
          imageUrl: "/brand/moka-site-rooftop.jpg",
        },
        {
          title: "Mô hình cà phê sân vườn",
          segment: "Cafe / nhà hàng",
          capacity: "18,6 kWp",
          result: "Giảm khoảng 31% chi phí điện ban ngày",
          body: "Ưu tiên mô hình thuê để giảm áp lực vốn đầu kỳ mà vẫn có lớp giám sát sản lượng minh bạch.",
          imageUrl: "/brand/moka-panel-angle.jpg",
        },
        {
          title: "Xưởng quy mô nhỏ",
          segment: "SME / nhà xưởng",
          capacity: "48 kWp",
          result: "Tối ưu chi phí điện và giữ dòng tiền vận hành ổn định hơn",
          body: "Phù hợp cho doanh nghiệp muốn nhìn rõ hiệu quả tài chính và có đầu mối vận hành sau bán hàng.",
          imageUrl: "/brand/moka-under-array.jpg",
        },
      ] satisfies HomepageCaseStudy[],
    },
    implementation: {
      eyebrow: "Quy trình triển khai",
      title: "Rõ từng bước, dễ quyết định và dễ theo dõi sau khi đi vào vận hành.",
      steps: [
        "Khảo sát công trình, phụ tải tiêu thụ điện và điều kiện mái thực tế.",
        "Đề xuất công suất, mô hình thanh toán và kịch bản tiết kiệm phù hợp.",
        "Triển khai, nghiệm thu, bàn giao tài liệu và kích hoạt portal khách hàng.",
        "Giám sát sản lượng, hỗ trợ kỹ thuật và bảo trì định kỳ theo cam kết dịch vụ.",
      ],
      operationsTeaserTitle: "Khách hàng sẽ theo dõi hệ thống và nhận hỗ trợ như thế nào?",
      operationsTeaserBody:
        "Moka Solar chuẩn bị sẵn quy trình giám sát, nhắc bảo trì, xử lý sự cố và theo dõi ticket để khách hàng luôn có cảm giác được đồng hành sau lắp đặt.",
      operationsCtaLabel: "Xem trang vận hành",
      operationsCtaHref: "/operations",
    },
    faq: [
      {
        question: "Khách hàng có bắt buộc phải bỏ toàn bộ vốn ngay từ đầu không?",
        answer:
          "Không. Moka Solar có thể tư vấn theo mô hình thuê hệ thống, PPA, trả góp hoặc hybrid tùy dòng tiền và mục tiêu sử dụng của từng công trình.",
      },
      {
        question: "Portal khách hàng dùng để làm gì?",
        answer:
          "Portal giúp theo dõi sản lượng, hóa đơn, thanh toán, ticket hỗ trợ và các mốc vận hành của hệ thống theo từng kỳ.",
      },
      {
        question: "Giá điện 2.500 đ/kWh có áp dụng cố định cho mọi trường hợp không?",
        answer:
          "Đây là mức tham chiếu theo chính sách Moka để khách hàng hình dung phương án ban đầu. Đơn giá thực tế sẽ được xác nhận trong hợp đồng.",
      },
      {
        question: "Sau lắp đặt, khách hàng liên hệ ai khi cần hỗ trợ?",
        answer:
          "Khách hàng có thể gửi ticket trên portal, nhắn Zalo hoặc gọi trực tiếp tới đội vận hành trong giờ làm việc.",
      },
    ] satisfies HomepageFaq[],
    finalCta: {
      eyebrow: "Sẵn sàng nhận tư vấn",
      title:
        "Nếu bạn đang cân nhắc điện mặt trời, hãy bắt đầu từ một buổi trao đổi ngắn và rõ.",
      body:
        "Moka Solar sẽ giúp bạn chốt công suất phù hợp, cấu trúc thanh toán hợp lý và lộ trình triển khai đủ thực tế để ra quyết định.",
      primaryLabel: "Để lại thông tin ngay",
      secondaryLabel: "Nhắn Zalo cho Moka Solar",
    },
  },
  footer: {
    eyebrow: "Thương hiệu dịch vụ điện mặt trời",
    headline:
      "Moka Solar đồng hành từ khảo sát, triển khai đến vận hành và hỗ trợ sau bán hàng.",
    description:
      "Moka Solar là thương hiệu dịch vụ năng lượng mặt trời do Công ty TNHH Truyền thông Moka vận hành. Chúng tôi tập trung vào tư vấn rõ ràng, vận hành gọn và khả năng phục vụ khách hàng dài hạn.",
    ctaLabel: "Nhận tư vấn nhanh",
    ctaHref: "/contact",
    secondaryCtaLabel: "Mở chat tư vấn",
    sections: [
      {
        title: "Giải pháp",
        href: "/solutions",
        links: [
          { label: "Mô hình triển khai", href: "/solutions" },
          { label: "Bảng giá và mô hình thanh toán", href: "/pricing" },
          { label: "Trang vận hành", href: "/operations" },
        ],
      },
      {
        title: "Doanh nghiệp",
        links: [
          { label: "Moka Solar", href: "/" },
          { label: "Công ty TNHH Truyền thông Moka", href: "/about" },
          { label: "Đăng nhập hệ thống", href: "/login" },
        ],
      },
      {
        title: "Liên hệ",
        links: [
          { label: "Hotline: 0342608192", href: "tel:0342608192" },
          {
            label: "Email: mokamediacompany@gmail.com",
            href: "mailto:mokamediacompany@gmail.com",
          },
          { label: "Chat Zalo", href: "https://zalo.me/0342608192" },
        ],
      },
    ] satisfies FooterSection[],
    legalLinks: [
      { label: "Chính sách bảo mật", href: "/privacy" },
      { label: "Điều khoản sử dụng", href: "/terms" },
    ] satisfies FooterLink[],
    copyright:
      "© 2026 Moka Solar - Công ty TNHH Truyền thông Moka. Bảo lưu mọi quyền.",
  },
  chat: {
    enabled: true,
    aiEnabled: true,
    teamAvailabilityLabel: "Tư vấn trực tiếp trong giờ làm việc 8h đến 17h",
    greeting:
      "Bạn có thể gọi ngay, nhắn Zalo hoặc để lại thông tin để đội ngũ Moka Solar liên hệ. Nếu cần hỏi nhanh về mô hình triển khai, bảng giá hoặc quy trình, trợ lý AI có thể hỗ trợ ở mức cơ bản.",
    humanCheckLabel:
      "Tôi đang cần tư vấn thật về điện mặt trời cho công trình của mình",
    leadPrompt:
      "Để nhận phương án sơ bộ hoặc tư vấn chi tiết hơn, vui lòng để lại số điện thoại hoặc Zalo để đội ngũ Moka Solar liên hệ trực tiếp.",
    maxFreeMessages: 10,
    cooldownSeconds: 30,
    quickPrompts: [
      "Tôi muốn biết công trình của mình phù hợp mô hình nào.",
      "Tôi muốn nhận tư vấn theo mức tiền điện hiện tại.",
      "Tôi cần báo giá sơ bộ cho villa hoặc homestay.",
    ],
  },
  salesModels: [
    {
      id: "ppa",
      contractType: "PPA / bán điện theo kWh",
      name: "Trả tiền theo điện năng sử dụng",
      badge: "Phù hợp để giảm vốn đầu kỳ",
      summary:
        "Khách hàng thanh toán theo sản lượng điện mặt trời tạo ra theo tháng. Phù hợp cho công trình muốn chuyển một phần chi phí điện sang mô hình linh hoạt hơn mà chưa cần đầu tư toàn bộ ngay từ đầu.",
      highlights: [
        "Giảm áp lực vốn đầu tư ban đầu",
        "Theo dõi điện năng hàng tháng",
        "Hóa đơn rõ ràng và dễ đối soát",
      ],
      pricing: "2.500 đ/kWh, chưa gồm VAT",
      detail: {
        eyebrow: "Mô hình PPA / theo kWh",
        title: "Trả tiền theo điện năng tạo ra để giảm áp lực vốn đầu kỳ.",
        summary:
          "Phù hợp cho khách hàng muốn nhìn rõ sản lượng theo tháng, mức thanh toán và hiệu quả tiết kiệm mà không cần đầu tư toàn bộ hệ thống ngay.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Quán cà phê, nhà hàng, homestay, villa hoặc doanh nghiệp nhỏ muốn tối ưu chi phí điện nhưng vẫn giữ dòng tiền nhẹ hơn ở giai đoạn đầu.",
        pricingLabel: "Cách tính tiền",
        pricingBody:
          "Tiền thanh toán = tổng sản lượng điện mặt trời theo tháng x đơn giá đã thống nhất. Mức tham chiếu hiện tại là 2.500 đ/kWh, chưa gồm VAT.",
        exampleLabel: "Ví dụ minh họa",
        exampleBody:
          "Ví dụ, với 3.200 kWh PV trong tháng, mức thanh toán theo chính sách Moka vào khoảng 8,0 triệu đồng trước VAT.",
        benefits: [
          "Không cần bỏ toàn bộ vốn ngay từ đầu.",
          "Dễ hiểu với người ra quyết định vì bám trực tiếp vào sản lượng hàng tháng.",
          "Phù hợp để mở rộng sang nhiều site trong tương lai.",
        ],
        operations: [
          "Theo dõi sản lượng và hóa đơn ngay trong portal khách hàng.",
          "Nhận báo cáo rõ ràng theo từng tháng và trạng thái thanh toán.",
          "Có ticket hỗ trợ khi cần kiểm tra hệ thống hoặc đối soát số liệu.",
        ],
        support:
          "Bao gồm giám sát hệ thống, nhắc kiểm tra định kỳ và hỗ trợ sau bán hàng theo phạm vi đã thống nhất.",
        process: [
          "Khảo sát công trình và phụ tải tiêu thụ điện.",
          "Đề xuất công suất và kịch bản sản lượng tham khảo.",
          "Ký hợp đồng, triển khai, nghiệm thu và kích hoạt portal vận hành.",
        ],
        ctaTopic: "Tư vấn mô hình bán điện theo kWh",
      },
    },
    {
      id: "lease",
      contractType: "Thuê hệ thống",
      name: "Thuê hệ thống cố định theo tháng",
      badge: "Dễ dự trù ngân sách",
      summary:
        "Khách hàng trả phí cố định theo tháng trong thời hạn hợp đồng. Phù hợp khi cần chi phí ổn định và dễ lập kế hoạch ngân sách.",
      highlights: [
        "Chi phí hàng tháng ổn định",
        "Dễ lập ngân sách vận hành",
        "Có lớp bảo trì và hỗ trợ đi kèm",
      ],
      pricing: "Theo cấu hình hệ thống và thời hạn thuê",
      detail: {
        eyebrow: "Thuê hệ thống",
        title: "Giữ chi phí điện mặt trời ổn định theo ngân sách hàng tháng.",
        summary:
          "Mô hình này phù hợp khi khách hàng muốn tối ưu dòng tiền, dễ lập kế hoạch tài chính và vẫn có một hệ thống được theo dõi, bảo trì bài bản.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Biệt thự, homestay, quán cà phê hoặc doanh nghiệp muốn chi phí đều, dễ quản trị và không muốn tự xử lý hạ tầng kỹ thuật.",
        pricingLabel: "Cách tính tiền",
        pricingBody:
          "Phí thuê được xác định theo công suất, cấu hình thiết bị, thời hạn hợp đồng và phạm vi vận hành đi kèm.",
        exampleLabel: "Ví dụ minh họa",
        exampleBody:
          "Một công trình 15 kWp có thể được cấu trúc theo phí cố định hàng tháng, giúp chủ đầu tư dễ dự trù ngân sách mà vẫn theo dõi được hiệu quả sản lượng.",
        benefits: [
          "Chi phí dễ dự báo hơn.",
          "Không phải tự tổ chức bảo trì và theo dõi thiết bị.",
          "Dễ phù hợp với mô hình vận hành doanh nghiệp hoặc dịch vụ lưu trú.",
        ],
        operations: [
          "Theo dõi trạng thái hệ thống và lịch sử hỗ trợ trên portal.",
          "Có đầu mối vận hành rõ ràng khi cần kiểm tra.",
          "Có thể kết hợp với báo cáo theo kỳ cho bộ phận vận hành nội bộ.",
        ],
        support:
          "Moka Solar phụ trách lớp giám sát, kiểm tra định kỳ và tiếp nhận yêu cầu hỗ trợ theo cam kết dịch vụ.",
        process: [
          "Đánh giá phụ tải và mục tiêu tài chính của công trình.",
          "Đề xuất công suất và cấu trúc phí thuê phù hợp.",
          "Triển khai, nghiệm thu và đưa vào vận hành theo lộ trình thống nhất.",
        ],
        ctaTopic: "Tư vấn mô hình thuê hệ thống",
      },
    },
    {
      id: "installment",
      contractType: "Trả góp",
      name: "Sở hữu dần tài sản",
      badge: "Phù hợp khi muốn sở hữu hệ thống",
      summary:
        "Khách hàng thanh toán theo kỳ để dần sở hữu hệ thống. Phù hợp khi muốn cân đối vốn đầu tư ban đầu nhưng vẫn hướng tới tài sản vận hành lâu dài.",
      highlights: [
        "Sở hữu tài sản theo lộ trình",
        "Dễ cân đối vốn đầu tư",
        "Phương án tài chính rõ cho người ra quyết định",
      ],
      pricing: "Theo công suất, thời hạn và cấu trúc trả góp",
      detail: {
        eyebrow: "Trả góp",
        title: "Sở hữu hệ thống theo lộ trình phù hợp hơn với dòng tiền đầu tư.",
        summary:
          "Mô hình trả góp giúp khách hàng tiến tới sở hữu tài sản nhưng không cần dồn toàn bộ vốn tại một thời điểm.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Khách hàng muốn nắm quyền sở hữu hệ thống về dài hạn nhưng vẫn cần tối ưu chi phí đầu kỳ.",
        pricingLabel: "Cách tính tiền",
        pricingBody:
          "Cấu trúc thanh toán được xác định theo giá trị hệ thống, thời hạn hợp đồng, lãi suất và các điều khoản vận hành đi kèm.",
        exampleLabel: "Giá trị khách hàng nhận được",
        exampleBody:
          "Khách hàng có roadmap thanh toán rõ, hồ sơ công trình gọn và dữ liệu vận hành đủ minh bạch để theo dõi sau triển khai.",
        benefits: [
          "Giữ mục tiêu sở hữu tài sản.",
          "Giảm áp lực vốn ban đầu.",
          "Dễ lập hồ sơ trình duyệt và kế hoạch đầu tư nội bộ.",
        ],
        operations: [
          "Theo dõi sản lượng và hóa đơn trên portal.",
          "Nhận nhắc bảo trì và hỗ trợ kỹ thuật theo phạm vi hợp đồng.",
          "Có lịch sử thanh toán và trạng thái hệ thống rõ ràng.",
        ],
        support:
          "Moka Solar hỗ trợ khách hàng từ khảo sát, triển khai đến lớp vận hành sau bàn giao theo mô hình đã thống nhất.",
        process: [
          "Khảo sát công trình và nhu cầu đầu tư.",
          "Xây dựng phương án trả góp, đơn giá và thời hạn phù hợp.",
          "Triển khai, nghiệm thu và đưa hệ thống vào theo dõi định kỳ.",
        ],
        ctaTopic: "Tư vấn mô hình trả góp",
      },
    },
    {
      id: "hybrid",
      contractType: "Hybrid có lưu trữ",
      name: "Tối ưu thêm lớp lưu trữ",
      badge: "Ưu tiên ổn định và chủ động",
      summary:
        "Dành cho công trình muốn tăng tính chủ động nguồn điện, tối ưu trải nghiệm vận hành và cân nhắc thêm lớp pin lưu trữ.",
      highlights: [
        "Chủ động hơn trong vận hành",
        "Phù hợp công trình cần trải nghiệm cao cấp",
        "Có cấu trúc vận hành rõ ràng",
      ],
      pricing: "Theo cấu hình pin lưu trữ và hệ thống hybrid",
      detail: {
        eyebrow: "Hybrid có lưu trữ",
        title: "Bổ sung lớp lưu trữ cho công trình cần sự chủ động và trải nghiệm cao hơn.",
        summary:
          "Mô hình hybrid phù hợp cho công trình cần tính ổn định, muốn quản lý nguồn điện linh hoạt hơn và ưu tiên trải nghiệm vận hành cao cấp.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Villa cao cấp, homestay, cơ sở dịch vụ hoặc doanh nghiệp cần tính ổn định và hình ảnh công trình bài bản hơn.",
        pricingLabel: "Cách tính tiền",
        pricingBody:
          "Được xác định theo công suất PV, dung lượng lưu trữ, cấu hình thiết bị và phạm vi vận hành đi kèm.",
        exampleLabel: "Giá trị khách hàng nhận được",
        exampleBody:
          "Khách hàng có thêm lớp chủ động về nguồn điện, theo dõi tốt hơn trạng thái hệ thống và có cấu trúc hỗ trợ sau bán hàng rõ ràng.",
        benefits: [
          "Tăng tính chủ động của hệ thống.",
          "Phù hợp với công trình ưu tiên trải nghiệm cao cấp.",
          "Có thể mở rộng về sau theo nhu cầu vận hành.",
        ],
        operations: [
          "Theo dõi dữ liệu hệ thống trên portal.",
          "Có đầu mối xử lý khi cần kiểm tra trạng thái thiết bị.",
          "Dễ phối hợp lịch bảo trì và chăm sóc định kỳ.",
        ],
        support:
          "Moka Solar hỗ trợ khách hàng từ giai đoạn tư vấn, triển khai đến vận hành để mô hình hybrid không trở thành một hệ thống khó theo dõi sau bàn giao.",
        process: [
          "Đánh giá mục tiêu vận hành và nhu cầu chủ động nguồn điện.",
          "Đề xuất cấu hình hybrid và lộ trình triển khai phù hợp.",
          "Triển khai, bàn giao và tổ chức lớp theo dõi sau vận hành.",
        ],
        ctaTopic: "Tư vấn mô hình hybrid có lưu trữ",
      },
    },
  ] satisfies PublicSalesModel[],
  solutionTracks: [
    {
      id: "residential",
      eyebrow: "Nhà ở cao cấp / villa / homestay",
      title: "Ưu tiên công trình đẹp, phương án dễ hiểu và lớp chăm sóc đủ yên tâm sau triển khai.",
      body:
        "Phù hợp cho chủ nhà hoặc mô hình lưu trú muốn tiết kiệm điện nhưng vẫn quan tâm đến tính thẩm mỹ công trình, sự rõ ràng của phương án và trải nghiệm hậu mãi.",
      imageUrl: "/brand/moka-site-rooftop.jpg",
      detail: {
        eyebrow: "Giải pháp cho nhà ở cao cấp",
        title: "Điện mặt trời dành cho công trình coi trọng hiệu quả tài chính lẫn trải nghiệm dịch vụ.",
        summary:
          "Moka Solar tập trung vào cách trình bày gọn, hình ảnh công trình sạch và khả năng đồng hành sau triển khai để chủ đầu tư yên tâm hơn.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Villa, biệt thự, homestay, nhà phố cao cấp hoặc cơ sở lưu trú quy mô nhỏ.",
        pricingLabel: "Gợi ý mô hình",
        pricingBody:
          "Thường phù hợp với thuê hệ thống hoặc trả góp, tùy việc khách muốn tối ưu vốn đầu tư ban đầu hay muốn sở hữu tài sản.",
        exampleLabel: "Giá trị khách hàng nhìn thấy",
        exampleBody:
          "Phương án gọn, công trình đẹp và portal rõ ràng để theo dõi sản lượng, hóa đơn, hỗ trợ sau lắp đặt.",
        benefits: [
          "Đề xuất rõ ràng, dễ trao đổi với chủ đầu tư.",
          "Công trình được trình bày theo hướng sạch, sang và đáng tin cậy.",
          "Có lớp chăm sóc sau bán hàng thay vì chỉ dừng ở lắp đặt.",
        ],
        operations: [
          "Theo dõi hệ thống và hóa đơn trên portal.",
          "Có đầu mối hỗ trợ khi cần kiểm tra hoặc bảo trì.",
          "Dùng Zalo hoặc form nhanh để gửi yêu cầu hỗ trợ.",
        ],
        support:
          "Phù hợp với nhóm khách hàng muốn một trải nghiệm dịch vụ gọn, dễ hiểu và có người theo sau sau ngày nghiệm thu.",
        process: [
          "Khảo sát mái và nhu cầu sử dụng điện.",
          "Đề xuất mô hình tài chính và công suất phù hợp.",
          "Triển khai, nghiệm thu và tiếp nhận vận hành sau bàn giao.",
        ],
        ctaTopic: "Tư vấn điện mặt trời cho villa hoặc homestay",
      },
    },
    {
      id: "commercial",
      eyebrow: "Cafe / nhà hàng / doanh nghiệp nhỏ",
      title: "Tối ưu chi phí điện ban ngày và giữ trải nghiệm vận hành rõ ràng cho đội quản lý.",
      body:
        "Phù hợp cho công trình dịch vụ và SME cần nhìn rõ hiệu quả tài chính, dễ theo dõi hóa đơn và có đầu mối hỗ trợ sau triển khai.",
      imageUrl: "/brand/moka-panel-angle.jpg",
      detail: {
        eyebrow: "Giải pháp cho kinh doanh dịch vụ",
        title: "Giảm chi phí điện và giữ quy trình vận hành đủ rõ cho đội ngũ vận hành nội bộ.",
        summary:
          "Nhóm công trình này thường cần một phương án vừa dễ chốt về tài chính vừa đủ minh bạch để người quản lý theo dõi theo tháng.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Quán cà phê, nhà hàng, studio, văn phòng nhỏ, SME và các site dịch vụ có điện ban ngày cao.",
        pricingLabel: "Gợi ý mô hình",
        pricingBody:
          "Mô hình PPA hoặc thuê hệ thống thường giúp giảm áp lực vốn đầu kỳ và giữ nhịp chi phí dễ kiểm soát hơn.",
        exampleLabel: "Điều khách hàng quan tâm nhất",
        exampleBody:
          "Chi phí điện giảm bao nhiêu, cách tính hóa đơn ra sao và ai là đầu mối xử lý khi hệ thống cần kiểm tra.",
        benefits: [
          "Dễ chốt cho người quản lý vận hành.",
          "Chi phí bám sát nhu cầu thực tế hơn.",
          "Có báo cáo, hóa đơn và hỗ trợ tập trung về một nơi.",
        ],
        operations: [
          "Theo dõi sản lượng, hóa đơn và ticket hỗ trợ trên portal.",
          "Giữ dữ liệu theo từng kỳ để bộ phận vận hành dễ đối soát.",
          "Có thể mở rộng thêm nhiều site trong tương lai.",
        ],
        support:
          "Moka Solar ưu tiên trình bày phương án gọn, dễ hiểu và có lớp vận hành đủ thực tế để phục vụ khách hàng doanh nghiệp nhỏ.",
        process: [
          "Khảo sát phụ tải, mái và mô hình vận hành.",
          "Đề xuất công suất, mô hình thanh toán và dự báo tiết kiệm.",
          "Triển khai, bàn giao và theo dõi vận hành định kỳ.",
        ],
        ctaTopic: "Tư vấn điện mặt trời cho cafe, nhà hàng hoặc SME",
      },
    },
    {
      id: "operations",
      eyebrow: "Vận hành / báo cáo / chăm sóc sau bán hàng",
      title: "Không chỉ lắp đặt, Moka Solar còn tổ chức lớp theo dõi và hỗ trợ sau triển khai.",
      body:
        "Đây là lớp giúp khách hàng cảm nhận rõ rằng hệ thống không bị bỏ quên sau ngày nghiệm thu: có portal, có dữ liệu theo kỳ, có ticket và có đầu mối xử lý.",
      imageUrl: "/brand/moka-under-array.jpg",
      detail: {
        eyebrow: "Lớp vận hành",
        title: "Đủ dữ liệu để khách hàng yên tâm và đủ quy trình để đội ngũ xử lý khi có việc phát sinh.",
        summary:
          "Moka Solar tổ chức trải nghiệm sau bán hàng theo hướng gọn, minh bạch và dễ theo dõi cho cả khách hàng lẫn đội vận hành.",
        fitLabel: "Phù hợp cho",
        fitBody:
          "Doanh nghiệp và chủ đầu tư muốn xây dựng một trải nghiệm dịch vụ bài bản, không chỉ dừng ở giai đoạn bàn giao.",
        pricingLabel: "Giá trị vận hành",
        pricingBody:
          "Lớp vận hành tốt giúp khách hàng an tâm hơn, giảm cảm giác bị bỏ rơi sau nghiệm thu và tăng khả năng chốt ở giai đoạn đầu.",
        exampleLabel: "Khách hàng sẽ thấy gì",
        exampleBody:
          "Sản lượng, hóa đơn, ticket hỗ trợ, lịch bảo trì và trạng thái hệ thống được trình bày rõ trên portal thay vì nằm rời rạc ở nhiều nơi.",
        benefits: [
          "Tăng độ tin cậy cho thương hiệu dịch vụ.",
          "Giảm phụ thuộc vào tin nhắn rời rạc và bảng tính thủ công.",
          "Tạo hành trình khách hàng rõ từ lúc bán đến lúc vận hành.",
        ],
        operations: [
          "Theo dõi sản lượng và tình trạng hệ thống.",
          "Tiếp nhận yêu cầu hỗ trợ và cập nhật tiến độ xử lý.",
          "Nhắc bảo trì và ghi nhận lịch sử chăm sóc sau bán hàng.",
        ],
        support:
          "Đây là lớp giúp Moka Solar khác với một website giới thiệu đơn thuần: khách hàng cảm nhận được có hệ thống, có quy trình và có người chịu trách nhiệm.",
        process: [
          "Chuẩn hóa cách tiếp nhận và theo dõi khách hàng.",
          "Kết nối dữ liệu hợp đồng, hóa đơn và hệ thống.",
          "Giữ trải nghiệm hỗ trợ thống nhất trong suốt vòng đời dự án.",
        ],
        ctaTopic: "Tư vấn trang vận hành và chăm sóc sau bán hàng",
      },
    },
  ] satisfies PublicSolutionTrack[],
  operationsPage: {
    hero: {
      eyebrow: "Vận hành và chăm sóc sau bán hàng",
      title:
        "Khách hàng theo dõi sản lượng, hóa đơn và hỗ trợ trên một hành trình rõ ràng hơn.",
      description:
        "Moka Solar không dừng ở lắp đặt. Chúng tôi chuẩn bị lớp giám sát, báo cáo, bảo trì và tiếp nhận yêu cầu hỗ trợ để khách hàng luôn thấy rõ ai đang đồng hành cùng hệ thống sau ngày nghiệm thu.",
    },
    pillars: [
      {
        title: "Theo dõi sản lượng theo kỳ",
        body: "Khách hàng xem điện tạo ra, điện tiêu thụ, hóa đơn và các mốc thanh toán ngay trong portal.",
      },
      {
        title: "Giám sát và nhắc bảo trì",
        body: "Đội ngũ vận hành theo dõi snapshot thiết bị, lịch kiểm tra định kỳ và các tín hiệu cần chú ý.",
      },
      {
        title: "Xử lý sự cố có đầu mối rõ",
        body: "Khi có vấn đề, khách hàng có thể gửi ticket hoặc liên hệ trực tiếp để được tiếp nhận, xác minh và phản hồi theo quy trình.",
      },
      {
        title: "Báo cáo đủ để ra quyết định",
        body: "Từ sản lượng, mức tiết kiệm đến lịch sử hỗ trợ đều được tổ chức để khách dễ nắm tình trạng công trình.",
      },
    ],
    responseFlow: [
      "Tiếp nhận cảnh báo hoặc yêu cầu hỗ trợ từ portal, Zalo hoặc hotline.",
      "Xác minh nhanh từ xa qua dữ liệu monitor và lịch sử vận hành.",
      "Điều phối kiểm tra hoặc hướng dẫn xử lý bước đầu khi cần.",
      "Cập nhật lại khách hàng và lưu vết toàn bộ lịch sử hỗ trợ.",
    ],
    customerTools: [
      "Portal khách hàng để xem sản lượng, hóa đơn và trạng thái hệ thống.",
      "Ticket hỗ trợ để theo dõi các yêu cầu đang xử lý.",
      "Thông báo nhắc lịch bảo trì hoặc cập nhật vận hành khi cần.",
      "Báo cáo định kỳ giúp khách hàng nhìn lại hiệu quả tài chính và tình trạng dịch vụ.",
    ],
    commitments: [
      "Tư vấn trung thực về mô hình phù hợp với dòng tiền và mục tiêu sử dụng.",
      "Bàn giao rõ hồ sơ, cách theo dõi và đầu mối hỗ trợ sau lắp đặt.",
      "Giữ trải nghiệm khách hàng nhất quán giữa website, portal và đội ngũ tư vấn.",
    ],
    finalCta: {
      title: "Muốn xem phương án sơ bộ hoặc quy trình vận hành phù hợp cho công trình của bạn?",
      body:
        "Hãy để lại thông tin để Moka Solar tư vấn mô hình triển khai, cách theo dõi sản lượng và cấu trúc dịch vụ phù hợp với nhu cầu thực tế.",
    },
  },
};

export type PublicSiteConfig = typeof rawPublicSiteConfig;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeMojibake(value: string) {
  return /[\uFFFD\u0010-\u001F]/.test(value) || /(?:Ã.|Â.|â€|ï¿½)/.test(value);
}

function containsMojibake(value: unknown): boolean {
  if (typeof value === "string") {
    return looksLikeMojibake(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMojibake(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((item) => containsMojibake(item));
  }

  return false;
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) {
    return base;
  }

  if (Array.isArray(base)) {
    if (!Array.isArray(override) || containsMojibake(override)) {
      return base;
    }

    return override as T;
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(override)) {
      return base;
    }

    const mergedEntries = new Set([...Object.keys(base), ...Object.keys(override)]);

    return Object.fromEntries(
      Array.from(mergedEntries).map((key) => [
        key,
        deepMerge(
          (base as Record<string, unknown>)[key],
          (override as Record<string, unknown>)[key],
        ),
      ]),
    ) as T;
  }

  if (typeof base === "string") {
    if (typeof override !== "string" || looksLikeMojibake(override)) {
      return base;
    }
  }

  return override as T;
}

export const publicSiteConfig = rawPublicSiteConfig;

export function mergePublicSiteConfig(
  override?: Partial<PublicSiteConfig> | null,
): PublicSiteConfig {
  if (!override) {
    return publicSiteConfig;
  }

  return deepMerge(publicSiteConfig, override);
}

export function resolvePricingDetail(
  model: { id?: string; contractType?: string; name?: string },
  config: PublicSiteConfig = publicSiteConfig,
) {
  if (model.id) {
    const exact = config.salesModels.find((item) => item.id === model.id);
    if (exact) {
      return exact.detail;
    }
  }

  const source = `${model.contractType || ""} ${model.name || ""}`.toLowerCase();

  if (source.includes("ppa") || source.includes("kwh")) {
    return config.salesModels.find((item) => item.id === "ppa")?.detail || null;
  }

  if (source.includes("thuê") || source.includes("lease")) {
    return config.salesModels.find((item) => item.id === "lease")?.detail || null;
  }

  if (source.includes("hybrid")) {
    return config.salesModels.find((item) => item.id === "hybrid")?.detail || null;
  }

  return config.salesModels.find((item) => item.id === "installment")?.detail || null;
}

export function resolveSolutionDetail(
  track: { id?: string; eyebrow?: string; title?: string },
  index = 0,
  config: PublicSiteConfig = publicSiteConfig,
) {
  if (track.id) {
    const exact = config.solutionTracks.find((item) => item.id === track.id);
    if (exact) {
      return exact.detail;
    }
  }

  const source = `${track.eyebrow || ""} ${track.title || ""}`.toLowerCase();

  if (source.includes("villa") || source.includes("nhà ở") || index === 0) {
    return config.solutionTracks[0].detail;
  }

  if (
    source.includes("doanh nghiệp") ||
    source.includes("nhà hàng") ||
    source.includes("cafe") ||
    index === 1
  ) {
    return config.solutionTracks[1].detail;
  }

  return config.solutionTracks[2].detail;
}

export function buildContactHref(
  topic?: string,
  config: PublicSiteConfig = publicSiteConfig,
) {
  if (!topic?.trim()) {
    return config.contact.contactPageHref;
  }

  return `${config.contact.contactPageHref}?topic=${encodeURIComponent(topic.trim())}`;
}
