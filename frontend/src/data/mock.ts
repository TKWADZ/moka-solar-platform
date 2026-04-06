import {
  ChartPoint,
  ContractRow,
  CustomerRow,
  InvoiceRow,
  NavItem,
  NotificationRow,
  PackageCard,
  PaymentRow,
  StatCardItem,
  SystemRow,
  TicketRow,
} from '@/types';
import { formatCompactCurrency, formatCurrency } from '@/lib/utils';

export const customerNav: NavItem[] = [
  { href: '/customer', label: 'Tổng quan', description: 'Điện năng, tiết kiệm và trạng thái hóa đơn', featureKey: 'customer_dashboard' },
  { href: '/customer/meters', label: 'Chỉ số điện', description: 'Lịch sử kỳ điện, chỉ số cũ/mới và nguồn dữ liệu', featureKey: 'customer_dashboard' },
  { href: '/customer/billing', label: 'Hóa đơn', description: 'Danh sách hóa đơn, PDF và ngày đến hạn', featureKey: 'billing' },
  { href: '/customer/payments', label: 'Thanh toán', description: 'Lịch sử giao dịch và phương thức thanh toán', featureKey: 'payments' },
  { href: '/customer/systems', label: 'Hệ thống điện', description: 'Thiết bị, sản lượng và hiệu suất vận hành', featureKey: 'systems' },
  { href: '/customer/contracts', label: 'Hợp đồng', description: 'Mô hình giá và tệp đính kèm', featureKey: 'contracts' },
  { href: '/customer/profile', label: 'Hồ sơ', description: 'Tài khoản, địa chỉ lắp đặt và bảo mật', featureKey: 'customer_profile' },
  { href: '/customer/support', label: 'Hỗ trợ', description: 'Ticket và phản hồi từ đội ngũ vận hành', featureKey: 'support' },
];

export const adminNav: NavItem[] = [
  { href: '/admin', label: 'Tổng quan', description: 'KPI danh mục và cảnh báo vận hành', featureKey: 'admin_dashboard' },
  { href: '/admin/customers', label: 'Khách hàng', description: 'Tài khoản, phân nhóm và MRR', featureKey: 'customers' },
  { href: '/admin/users', label: 'Người dùng', description: 'Tai khoan, vai tro va phan quyen van hanh', featureKey: 'users' },
  { href: '/admin/systems', label: 'Hệ thống', description: 'Danh mục lắp đặt và uptime', featureKey: 'systems' },
  { href: '/admin/operations-data', label: 'Dữ liệu vận hành', description: 'Nhập tay, import CSV/Excel và theo dõi kỳ dữ liệu tháng', featureKey: 'operational_data' },
  { href: '/admin/solarman', label: 'SOLARMAN', description: 'Kết nối tài khoản, đồng bộ station và sản lượng PV tháng', featureKey: 'solarman_connections' },
  { href: '/admin/luxpower', label: 'LuxPower Cloud', description: 'Session cloud, inverter serial và snapshot monitor theo backend', featureKey: 'luxpower_connections' },
  { href: '/admin/deye', label: 'Deye OpenAPI', description: 'Token, account info, station, device và sản lượng PV tháng', featureKey: 'deye_connections' },
  { href: '/admin/contracts', label: 'Hợp đồng', description: 'Mô hình thương mại và điều khoản', featureKey: 'contracts' },
  { href: '/admin/billing', label: 'Hóa đơn', description: 'Phát hành hóa đơn và công nợ', featureKey: 'billing' },
  { href: '/admin/zalo', label: 'Zalo OA', description: 'Cấu hình OA, test kết nối và gửi mẫu hóa đơn', featureKey: 'billing' },
  { href: '/admin/ai', label: 'ChatGPT', description: 'Trợ lý AI cho nội dung, hỗ trợ và vận hành', featureKey: 'ai_assistant' },
  { href: '/admin/website-settings', label: 'Thiết lập website', description: 'Logo, hotline, menu, pricing, FAQ, CTA và footer', featureKey: 'website_settings' },
  { href: '/admin/media', label: 'Quản lý ảnh', description: 'Thư viện ảnh, upload và tái sử dụng media', featureKey: 'media_library' },
  { href: '/admin/cms', label: 'CMS website', description: 'Chỉnh trang chủ, giới thiệu, giải pháp, liên hệ và bảng giá', featureKey: 'marketing_pages' },
  { href: '/admin/leads', label: 'Lead', description: 'Yêu cầu tư vấn từ website và hàng chờ phân loại', featureKey: 'contact_inquiries' },
  { href: '/admin/posts', label: 'Nội dung', description: 'Bài viết, case study và tin tức công khai', featureKey: 'content_posts' },
  { href: '/admin/reports', label: 'Báo cáo', description: 'Phân tích doanh thu, điện năng và thanh toán', featureKey: 'reports' },
  { href: '/admin/packages', label: 'Gói dịch vụ', description: 'Chiến lược giá và quy tắc VAT', featureKey: 'service_packages' },
  { href: '/admin/support', label: 'Hỗ trợ', description: 'Ticket và theo dõi SLA', featureKey: 'support' },
  { href: '/admin/plugins', label: 'Plugin', description: 'Cài đặt, bật tắt và cấu hình module', featureKey: 'plugin_center' },
];

export const homeStats: StatCardItem[] = [
  { title: 'Managed generation', value: '1.82 GWh', subtitle: 'Seeded portfolio across rooftop, villa and factory sites', delta: '+18% YoY', trend: 'up' },
  { title: 'Collection health', value: '96.4%', subtitle: 'On-time cash collection across recurring contracts', delta: '+2.1 pts', trend: 'up' },
  { title: 'Active contracts', value: '248', subtitle: 'PPA, lease, installment and hybrid products', delta: '4 models live', trend: 'neutral' },
  { title: 'Average savings', value: formatCurrency(3280000), subtitle: 'Typical customer monthly savings vs. EVN retail rate', delta: 'Per operating site', trend: 'up' },
];

export const homeMetrics = [
  {
    label: 'Billing cho thị trường Việt Nam',
    value: 'VNPay, MoMo và bố cục hóa đơn quen thuộc với khách hàng trong nước',
  },
  {
    label: 'Trải nghiệm cao cấp',
    value: 'Giao diện sạch, typography rõ và dashboard tập trung vào dữ liệu quan trọng',
  },
  {
    label: 'Sẵn sàng vận hành',
    value: 'Hợp đồng, ticket, thông báo và audit log trong cùng một nền tảng',
  },
];

export const publicPackages: PackageCard[] = [
  {
    id: 'pkg-ppa',
    name: 'PPA Premium Rooftop',
    contractType: 'PPA / kWh',
    badge: 'Most flexible',
    summary: 'Ideal for cafes, offices and SMEs that want lower monthly bills without upfront capex.',
    highlights: ['Energy billed monthly per kWh', 'Annual escalation controls', 'Maintenance included'],
    pricing: 'From 2,250 VND / kWh',
  },
  {
    id: 'pkg-lease',
    name: 'Lease Flex 36',
    contractType: 'Fixed rental',
    badge: 'Predictable cashflow',
    summary: 'A fixed monthly subscription with uptime service and maintenance bundled in.',
    highlights: ['Flat monthly fee', '36-month term', 'Best for villas and hospitality'],
    pricing: 'From 6.5M VND / month',
  },
  {
    id: 'pkg-hybrid',
    name: 'Hybrid Commerce',
    contractType: 'Fixed + usage',
    badge: 'High-consumption sites',
    summary: 'For factories and commercial roofs that need a blended model combining subscription and usage.',
    highlights: ['Base fee plus kWh billing', 'Optional export settlement', 'High-consumption friendly'],
    pricing: '4.2M base + 1,850 VND / kWh',
  },
  {
    id: 'pkg-installment',
    name: 'Installment 24M',
    contractType: 'Installment',
    badge: 'Asset ownership',
    summary: 'Acquire the system over time with principal, interest and service fees built in.',
    highlights: ['24-month schedule', 'Principal + interest + service', 'Ownership path'],
    pricing: 'From 9.8M VND / month',
  },
];

export const customerSummary: StatCardItem[] = [
  { title: 'Solar generated', value: '1,240 kWh', subtitle: 'Current month portfolio output', delta: '+9% vs last month', trend: 'up' },
  { title: 'Site consumption', value: '1,610 kWh', subtitle: 'Load measured at the installation site', delta: '+4% vs last month', trend: 'up' },
  { title: 'Grid imported', value: '540 kWh', subtitle: 'Energy still purchased from EVN', delta: '-11% vs baseline', trend: 'up' },
  { title: 'Monthly savings', value: formatCurrency(3280000), subtitle: 'Estimated avoided electricity spend', delta: '+680k', trend: 'up' },
];

export const customerEnergyTrend: ChartPoint[] = [
  { name: '03/08', solar: 39, load: 48, grid: 14 },
  { name: '03/09', solar: 42, load: 47, grid: 12 },
  { name: '03/10', solar: 45, load: 50, grid: 10 },
  { name: '03/11', solar: 47, load: 49, grid: 9 },
  { name: '03/12', solar: 44, load: 51, grid: 13 },
  { name: '03/13', solar: 48, load: 53, grid: 11 },
  { name: '03/14', solar: 46, load: 52, grid: 12 },
  { name: '03/15', solar: 49, load: 54, grid: 11 },
  { name: '03/16', solar: 51, load: 55, grid: 10 },
  { name: '03/17', solar: 43, load: 50, grid: 14 },
  { name: '03/18', solar: 52, load: 56, grid: 9 },
];

export const customerInvoices: InvoiceRow[] = [
  { id: 'inv-1', number: 'INV-202603-001', month: '03/2026', dueDate: '25/03/2026', amount: 1260000, status: 'Issued', model: 'Bán điện theo kWh' },
  { id: 'inv-2', number: 'INV-202602-001', month: '02/2026', dueDate: '10/03/2026', amount: 1140000, status: 'Paid', model: 'Bán điện theo kWh' },
  { id: 'inv-3', number: 'INV-202601-001', month: '01/2026', dueDate: '10/02/2026', amount: 1215000, status: 'Paid', model: 'Bán điện theo kWh' },
];

export const customerPayments: PaymentRow[] = [
  { id: 'pay-1', invoiceNumber: 'INV-202602-001', method: 'MoMo QR', gateway: 'MoMo', amount: 1140000, status: 'Success', paidAt: '08/03/2026' },
  { id: 'pay-2', invoiceNumber: 'INV-202601-001', method: 'VNPay QR', gateway: 'VNPay', amount: 1215000, status: 'Success', paidAt: '08/02/2026' },
  { id: 'pay-3', invoiceNumber: 'INV-202512-001', method: 'Chuyển khoản ngân hàng', gateway: 'Đối soát nội bộ', amount: 1184000, status: 'Success', paidAt: '09/01/2026' },
];

export const customerTickets: TicketRow[] = [
  { id: 'ticket-1', title: 'Cần kiểm tra inverter vào khung 12h - 14h', status: 'Open', priority: 'High', updatedAt: '18/03/2026' },
  { id: 'ticket-2', title: 'Yêu cầu gửi lại bản PDF hợp đồng gần nhất', status: 'In Progress', priority: 'Medium', updatedAt: '16/03/2026' },
  { id: 'ticket-3', title: 'Cần giải thích chi tiết phí bảo trì tháng', status: 'Resolved', priority: 'Low', updatedAt: '12/03/2026' },
];

export const customerNotifications: NotificationRow[] = [
  { id: 'note-1', title: 'Hóa đơn tháng 03 đã sẵn sàng', body: 'Hóa đơn mới đã được phát hành và có thể thanh toán trực tuyến.', time: '2 giờ trước', tone: 'warning' },
  { id: 'note-2', title: 'Sản lượng điện đã cập nhật', body: 'Dữ liệu sản lượng từ inverter Deye đã được đồng bộ thành công.', time: '6 giờ trước', tone: 'success' },
  { id: 'note-3', title: 'Đã tiếp nhận yêu cầu hỗ trợ', body: 'Đội vận hành đã ghi nhận đề nghị kiểm tra inverter của bạn.', time: '1 ngày trước' },
];

export const customerSystems: SystemRow[] = [
  { id: 'SYS-DEMO-001', name: 'Cafe Nang Xanh Rooftop', capacity: '12.4 kWp', location: 'District 7, HCMC', inverter: 'Deye SUN-10K', status: 'Active', uptime: '99.2%' },
];

export const customerContracts: ContractRow[] = [
  { id: 'CTR-DEMO-001', type: 'PPA / kWh', customer: 'Cafe Nang Xanh', term: '60 months', pricing: '2,250 VND / kWh, VAT 8%', status: 'Active' },
];

export const customerProfile = {
  accountName: 'Nguyen Van A',
  companyName: 'Cafe Nang Xanh',
  email: 'customer@example.com',
  phone: '0900 000 000',
  installationAddress: 'Phú Mỹ Hưng, Quận 7, TP.HCM',
  billingAddress: 'Phú Mỹ Hưng, Quận 7, TP.HCM',
  paymentPreference: 'QR MoMo và chuyển khoản ngân hàng',
  security: ['Xác thực access token + refresh token', 'Phân quyền theo vai trò', 'Ghi nhật ký thao tác quản trị'],
};

export const adminSummary: StatCardItem[] = [
  { title: 'Total customers', value: '128', subtitle: 'Commercial, hospitality and residential portfolios', delta: '+14 this quarter', trend: 'up' },
  { title: 'Installed capacity', value: '843.5 kWp', subtitle: 'Fleet under monitoring and billing', delta: '+62.8 kWp', trend: 'up' },
  { title: 'Monthly revenue', value: formatCurrency(428500000), subtitle: 'Collected or issued in the current cycle', delta: '+11.6%', trend: 'up' },
  { title: 'On-time payment rate', value: '92.4%', subtitle: 'Portfolio collection quality', delta: '+3.2 pts', trend: 'up' },
];

export const adminRevenueTrend: ChartPoint[] = [
  { name: 'T7', revenue: 268000000 },
  { name: 'T8', revenue: 289000000 },
  { name: 'T9', revenue: 304000000 },
  { name: 'T10', revenue: 312000000 },
  { name: 'T11', revenue: 346000000 },
  { name: 'T12', revenue: 398000000 },
  { name: 'T1', revenue: 412000000 },
  { name: 'T2', revenue: 421000000 },
  { name: 'T3', revenue: 428500000 },
];

export const adminEnergyTrend: ChartPoint[] = [
  { name: '12 Mar', solar: 3780, load: 4210 },
  { name: '13 Mar', solar: 3925, load: 4300 },
  { name: '14 Mar', solar: 4010, load: 4340 },
  { name: '15 Mar', solar: 3980, load: 4295 },
  { name: '16 Mar', solar: 4065, load: 4385 },
  { name: '17 Mar', solar: 4120, load: 4410 },
  { name: '18 Mar', solar: 4190, load: 4450 },
];

export const adminCustomers: CustomerRow[] = [
  { id: 'CUS-001', name: 'Cafe Nắng Xanh', email: 'customer@example.com', segment: 'Nhà hàng - cafe', site: 'Quận 7, TP.HCM', system: '12.4 kWp', status: 'Healthy', mrr: 1260000 },
  { id: 'CUS-002', name: 'Villa Sunlake', email: 'villa@example.com', segment: 'Nhà ở cao cấp', site: 'Nhà Bè, TP.HCM', system: '18.6 kWp', status: 'Healthy', mrr: 6820000 },
  { id: 'CUS-003', name: 'Xưởng Moka', email: 'factory@example.com', segment: 'Nhà xưởng SME', site: 'Bình Chánh, TP.HCM', system: '83.2 kWp', status: 'Attention', mrr: 15800000 },
  { id: 'CUS-004', name: 'Trường Sao Mai', email: 'school@example.com', segment: 'Giáo dục', site: 'Thủ Đức, TP.HCM', system: '25.5 kWp', status: 'Healthy', mrr: 10400000 },
  { id: 'CUS-005', name: 'Riverside Office', email: 'office@example.com', segment: 'Văn phòng', site: 'Thủ Thiêm, TP.HCM', system: '32.0 kWp', status: 'Pending contract', mrr: 9400000 },
];

export const adminSystems: SystemRow[] = [
  { id: 'SYS-001', name: 'Cafe Nang Xanh Rooftop', capacity: '12.4 kWp', location: 'District 7, HCMC', inverter: 'Deye SUN-10K', status: 'Active', uptime: '99.2%' },
  { id: 'SYS-002', name: 'Villa Hybrid Estate', capacity: '18.6 kWp', location: 'Nha Be, HCMC', inverter: 'Huawei SUN2000', status: 'Active', uptime: '99.5%' },
  { id: 'SYS-003', name: 'Factory Hybrid Cluster', capacity: '83.2 kWp', location: 'Binh Chanh, HCMC', inverter: 'Solis 50K', status: 'Maintenance', uptime: '97.8%' },
  { id: 'SYS-004', name: 'Campus Installment Plant', capacity: '25.5 kWp', location: 'Thu Duc, HCMC', inverter: 'Growatt MAX', status: 'Active', uptime: '98.9%' },
];

export const adminContracts: ContractRow[] = [
  { id: 'CTR-001', type: 'PPA / kWh', customer: 'Cafe Nang Xanh', term: '60 months', pricing: '2,250 VND / kWh', status: 'Active' },
  { id: 'CTR-002', type: 'Lease', customer: 'Villa Sunlake', term: '36 months', pricing: '6.5M VND / month', status: 'Active' },
  { id: 'CTR-003', type: 'Hybrid', customer: 'Xuong Moka', term: '48 months', pricing: '4.2M base + 1,850 VND / kWh', status: 'Active' },
  { id: 'CTR-004', type: 'Installment', customer: 'Truong Sao Mai', term: '24 months', pricing: '9.8M VND / month', status: 'Active' },
];

export const adminInvoices: InvoiceRow[] = [
  { id: 'ainv-1', number: 'INV-202603-001', month: '03/2026', dueDate: '25/03/2026', amount: 1260000, status: 'Issued', customer: 'Cafe Nắng Xanh', model: 'Bán điện theo kWh' },
  { id: 'ainv-2', number: 'INV-202603-004', month: '03/2026', dueDate: '25/03/2026', amount: 10400000, status: 'Paid', customer: 'Trường Sao Mai', model: 'Trả góp' },
  { id: 'ainv-3', number: 'INV-202603-007', month: '03/2026', dueDate: '25/03/2026', amount: 15800000, status: 'Partial', customer: 'Xưởng Moka', model: 'Mô hình kết hợp' },
  { id: 'ainv-4', number: 'INV-202603-010', month: '03/2026', dueDate: '25/03/2026', amount: 6820000, status: 'Paid', customer: 'Villa Sunlake', model: 'Thuê hệ thống' },
  { id: 'ainv-5', number: 'INV-202602-011', month: '02/2026', dueDate: '10/03/2026', amount: 9410000, status: 'Overdue', customer: 'Riverside Office', model: 'Mô hình kết hợp' },
];

export const adminTickets: TicketRow[] = [
  { id: 'aticket-1', title: 'Cần kiểm tra inverter vào buổi trưa', status: 'Open', priority: 'High', updatedAt: '18/03/2026', owner: 'Cafe Nắng Xanh' },
  { id: 'aticket-2', title: 'Cần giải thích chi tiết công nợ tháng', status: 'In Progress', priority: 'Medium', updatedAt: '17/03/2026', owner: 'Villa Sunlake' },
  { id: 'aticket-3', title: 'Sai lệch số liệu công tơ trả lưới', status: 'Resolved', priority: 'Urgent', updatedAt: '16/03/2026', owner: 'Xưởng Moka' },
  { id: 'aticket-4', title: 'Yêu cầu gửi lại file hợp đồng PDF', status: 'Closed', priority: 'Low', updatedAt: '14/03/2026', owner: 'Trường Sao Mai' },
];

export const adminPackageCards = publicPackages;

export const salesHighlights = [
  {
    title: 'Vietnam-ready customer portal',
    body: 'Give site owners a premium dashboard for generation, savings, invoices, online payment and support.',
  },
  {
    title: 'Flexible billing engine',
    body: 'Run sale, lease, installment, PPA and hybrid contracts without rebuilding your finance workflow.',
  },
  {
    title: 'Operations control center',
    body: 'Equip your staff with customer management, inverter mock sync, ticket handling and revenue analytics.',
  },
];

export const publicProofPoints = [
  { label: 'Average customer monthly savings', value: formatCurrency(3280000) },
  { label: 'Typical collection improvement after portal rollout', value: '9-15%' },
  { label: 'Best-fit segments', value: 'Cafes, villas, schools, factories' },
];

export const adminHighlights = [
  { title: 'Revenue run-rate', value: formatCompactCurrency(2520000000) },
  { title: 'Unpaid invoices', value: '17' },
  { title: 'Open tickets', value: '6' },
  { title: 'Expected margin', value: '31.8%' },
];

