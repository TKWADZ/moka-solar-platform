import { ContractType, Prisma, PrismaClient, TicketPriority } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { buildDefaultFeaturePlugins } from '../src/feature-plugins/default-feature-plugins';
import { buildDefaultMarketingPages } from '../src/marketing-pages/default-marketing-pages';
import {
  normalizeEmail,
  normalizeVietnamPhone,
} from '../src/common/helpers/identity.helper';

const prisma = new PrismaClient();
const defaultSeedPassword = process.env.SEED_DEFAULT_PASSWORD?.trim() || '123456';
const bootstrapSuperAdminEmail =
  normalizeEmail(process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim()) || 'superadmin@example.com';
const bootstrapSuperAdminPhone = normalizeVietnamPhone(process.env.BOOTSTRAP_SUPERADMIN_PHONE?.trim());
const bootstrapSuperAdminName =
  process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || 'Moka Super Admin';
const bootstrapSuperAdminPassword =
  process.env.BOOTSTRAP_SUPERADMIN_PASSWORD?.trim() || defaultSeedPassword;
const bootstrapAdminEmail =
  normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()) || 'admin@mokasolar.com';
const bootstrapAdminPhone = normalizeVietnamPhone(process.env.BOOTSTRAP_ADMIN_PHONE?.trim());
const bootstrapAdminName =
  process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Moka Operations Admin';
const bootstrapAdminPassword =
  process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || defaultSeedPassword;
const bootstrapManagerEmail = normalizeEmail(process.env.BOOTSTRAP_MANAGER_EMAIL?.trim());
const bootstrapManagerPhone = normalizeVietnamPhone(process.env.BOOTSTRAP_MANAGER_PHONE?.trim());
const bootstrapManagerName =
  process.env.BOOTSTRAP_MANAGER_NAME?.trim() || 'Moka Operations Manager';
const bootstrapManagerPassword =
  process.env.BOOTSTRAP_MANAGER_PASSWORD?.trim() || defaultSeedPassword;

function fixed(value: number) {
  return Number(value.toFixed(2));
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function buildInvoicePayload(params: {
  contractType: ContractType;
  usageKwh: number;
  pricePerKwh?: number;
  fixedMonthlyFee?: number;
  maintenanceFee?: number;
  interestRate?: number;
  termMonths?: number;
  principalAmount?: number;
  vatRate?: number;
}) {
  const items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }> = [];

  const usageKwh = params.usageKwh;
  const pricePerKwh = params.pricePerKwh || 0;
  const fixedMonthlyFee = params.fixedMonthlyFee || 0;
  const maintenanceFee = params.maintenanceFee || 0;
  const interestRate = params.interestRate || 0;
  const termMonths = params.termMonths || 24;
  const principalAmount = params.principalAmount || 0;
  const vatRate = params.vatRate || 8;

  let subtotal = 0;

  if (params.contractType === 'PPA_KWH') {
    const amount = usageKwh * pricePerKwh;
    subtotal += amount;
    items.push({
      description: 'Energy usage charge',
      quantity: usageKwh,
      unitPrice: pricePerKwh,
      amount,
    });
  }

  if (params.contractType === 'LEASE') {
    subtotal += fixedMonthlyFee + maintenanceFee;
    items.push({
      description: 'Monthly lease fee',
      quantity: 1,
      unitPrice: fixedMonthlyFee,
      amount: fixedMonthlyFee,
    });
    items.push({
      description: 'Operations and maintenance',
      quantity: 1,
      unitPrice: maintenanceFee,
      amount: maintenanceFee,
    });
  }

  if (params.contractType === 'INSTALLMENT') {
    const principal = principalAmount / termMonths;
    const interest = (principalAmount * interestRate) / 100 / 12;
    subtotal += principal + interest + maintenanceFee;
    items.push({
      description: 'Monthly principal',
      quantity: 1,
      unitPrice: principal,
      amount: principal,
    });
    items.push({
      description: 'Interest',
      quantity: 1,
      unitPrice: interest,
      amount: interest,
    });
    items.push({
      description: 'Service fee',
      quantity: 1,
      unitPrice: maintenanceFee,
      amount: maintenanceFee,
    });
  }

  if (params.contractType === 'HYBRID') {
    const usageFee = usageKwh * pricePerKwh;
    subtotal += fixedMonthlyFee + usageFee + maintenanceFee;
    items.push({
      description: 'Fixed platform fee',
      quantity: 1,
      unitPrice: fixedMonthlyFee,
      amount: fixedMonthlyFee,
    });
    items.push({
      description: 'Energy usage fee',
      quantity: usageKwh,
      unitPrice: pricePerKwh,
      amount: usageFee,
    });
    items.push({
      description: 'Maintenance fee',
      quantity: 1,
      unitPrice: maintenanceFee,
      amount: maintenanceFee,
    });
  }

  if (params.contractType === 'SALE') {
    subtotal += fixedMonthlyFee;
    items.push({
      description: 'Sale milestone payment',
      quantity: 1,
      unitPrice: fixedMonthlyFee,
      amount: fixedMonthlyFee,
    });
  }

  const vatAmount = subtotal * (vatRate / 100);
  const totalAmount = subtotal + vatAmount;

  return {
    subtotal: fixed(subtotal),
    vatAmount: fixed(vatAmount),
    discountAmount: 0,
    penaltyAmount: 0,
    totalAmount: fixed(totalAmount),
    items: items.map((item) => ({
      ...item,
      quantity: fixed(item.quantity),
      unitPrice: fixed(item.unitPrice),
      amount: fixed(item.amount),
    })),
  };
}

function buildEnergyRecords(systemId: string, capacityKwp: number, baseLoad: number, days: number) {
  const records: Array<Record<string, unknown>> = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);

    const weatherFactor = 0.82 + ((offset % 11) * 0.018);
    const weekendFactor = date.getUTCDay() === 0 ? 0.88 : 1;
    const solarGeneratedKwh = fixed(capacityKwp * 3.9 * weatherFactor * weekendFactor);
    const loadConsumedKwh = fixed(baseLoad + capacityKwp * 1.2 + ((offset % 7) - 3) * 1.75);
    const gridExportedKwh = fixed(Math.max(1.2, solarGeneratedKwh * 0.16));
    const selfConsumedKwh = fixed(Math.max(0, solarGeneratedKwh - gridExportedKwh));
    const gridImportedKwh = fixed(Math.max(4.5, loadConsumedKwh - selfConsumedKwh));
    const savingAmount = fixed(selfConsumedKwh * 2200 + gridExportedKwh * 850);

    records.push({
      solarSystemId: systemId,
      recordDate: date,
      solarGeneratedKwh,
      loadConsumedKwh,
      gridImportedKwh,
      gridExportedKwh,
      selfConsumedKwh,
      savingAmount,
    });
  }

  return records;
}

const featurePluginsSeed = buildDefaultFeaturePlugins();
const marketingPagesSeed = buildDefaultMarketingPages();

async function main() {
  await prisma.featurePlugin.deleteMany();
  await prisma.marketingPage.deleteMany();
  await prisma.contactInquiry.deleteMany();
  await prisma.contentPost.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.energyRecord.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.solarSystem.deleteMany();
  await prisma.servicePackage.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  await prisma.featurePlugin.createMany({
    data: featurePluginsSeed.map((plugin) => ({
      ...plugin,
      config: plugin.config as Prisma.InputJsonValue,
    })),
  });

  await prisma.marketingPage.createMany({
    data: marketingPagesSeed.map((page) => ({
      ...page,
      content: page.content as Prisma.InputJsonValue,
    })),
  });

  const [superAdminRole, adminRole, managerRole, , customerRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: 'SUPER_ADMIN' },
      update: {},
      create: { code: 'SUPER_ADMIN', name: 'Super Admin' },
    }),
    prisma.role.upsert({
      where: { code: 'ADMIN' },
      update: {},
      create: { code: 'ADMIN', name: 'Admin' },
    }),
    prisma.role.upsert({
      where: { code: 'MANAGER' },
      update: {},
      create: { code: 'MANAGER', name: 'Manager' },
    }),
    prisma.role.upsert({
      where: { code: 'STAFF' },
      update: {},
      create: { code: 'STAFF', name: 'Staff' },
    }),
    prisma.role.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Customer' },
    }),
  ]);

  const superAdminPasswordHash = await bcrypt.hash(bootstrapSuperAdminPassword, 10);
  const adminPasswordHash = await bcrypt.hash(bootstrapAdminPassword, 10);
  const managerPasswordHash = await bcrypt.hash(bootstrapManagerPassword, 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: bootstrapSuperAdminEmail,
      phone: bootstrapSuperAdminPhone,
      phoneVerifiedAt: bootstrapSuperAdminPhone ? new Date() : null,
      fullName: bootstrapSuperAdminName,
      passwordHash: superAdminPasswordHash,
      roleId: superAdminRole.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: bootstrapAdminEmail,
      phone: bootstrapAdminPhone,
      phoneVerifiedAt: bootstrapAdminPhone ? new Date() : null,
      fullName: bootstrapAdminName,
      passwordHash: adminPasswordHash,
      roleId: adminRole.id,
    },
  });

  if (bootstrapManagerEmail) {
    await prisma.user.create({
      data: {
        email: bootstrapManagerEmail,
        phone: bootstrapManagerPhone,
        phoneVerifiedAt: bootstrapManagerPhone ? new Date() : null,
        fullName: bootstrapManagerName,
        passwordHash: managerPasswordHash,
        roleId: managerRole.id,
      },
    });
  }

  await prisma.contactInquiry.createMany({
    data: [
      {
        fullName: 'Tran Minh Solar',
        email: 'lead1@example.com',
        phone: '0988000111',
        companyName: 'Minh Solar Coffee',
        siteCount: '3 sites',
        message:
          'We are operating three cafes and want a PPA-style offer with monthly billing and a clean customer portal.',
        sourcePage: 'contact',
        status: 'NEW',
      },
      {
        fullName: 'Nguyen Hoang Logistics',
        email: 'lead2@example.com',
        phone: '0977000222',
        companyName: 'Hoang Logistics',
        siteCount: '1 warehouse',
        message:
          'Need a hybrid proposal for a warehouse roof and want to understand the collection workflow for monthly invoices.',
        sourcePage: 'contact',
        status: 'CONTACTED',
        internalNote: 'Qualified by ops team. Waiting for site survey slot.',
        handledByUserId: admin.id,
      },
    ],
  });

  await prisma.contentPost.createMany({
    data: [
      {
        authorId: admin.id,
        title: '5 sai lầm phổ biến khi doanh nghiệp đầu tư điện mặt trời mái nhà',
        slug: '5-sai-lam-khi-doanh-nghiep-dau-tu-dien-mat-troi-mai-nha',
        excerpt:
          'Một checklist ngắn cho SME tại Việt Nam để tránh đội vốn, sai mô hình hợp đồng và vận hành thiếu dữ liệu.',
        content: [
          'Nhiều doanh nghiệp bắt đầu từ báo giá thiết bị mà chưa khóa rõ bài toán tiền điện, mô hình hợp đồng và trách nhiệm vận hành.',
          '',
          'Bước đúng là xác định phụ tải, khung giờ tiêu thụ, kế hoạch tăng trưởng sản lượng và mức chấp nhận đầu tư ban đầu.',
          '',
          'Với mô hình PPA, lease hoặc hybrid, việc đo đếm dữ liệu hàng ngày và đối soát hóa đơn theo từng kỳ là điều bắt buộc nếu muốn vận hành minh bạch.',
        ].join('\n'),
        coverImageUrl:
          'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1600&q=80',
        tags: ['solar-rooftop', 'commercial', 'billing'],
        status: 'PUBLISHED',
        isFeatured: true,
        publishedAt: utcDate(2026, 3, 10),
      },
      {
        authorId: superAdmin.id,
        title: 'So sánh PPA, thuê hệ thống và trả góp cho thị trường Việt Nam',
        slug: 'so-sanh-ppa-thue-he-thong-va-tra-gop-cho-thi-truong-viet-nam',
        excerpt:
          'Mỗi mô hình phù hợp với một kiểu dòng tiền khác nhau. Bài viết này giúp đội sales và khách hàng chốt nhanh hơn.',
        content: [
          'PPA phù hợp khi khách hàng muốn giảm chi phí ngay mà không bỏ capex lớn.',
          '',
          'Thuê hệ thống phù hợp cho khách muốn hóa đơn ổn định theo tháng, dễ lập ngân sách.',
          '',
          'Trả góp phù hợp khi khách hàng muốn sở hữu tài sản trong trung hạn và chấp nhận kỳ thanh toán cao hơn giai đoạn đầu.',
        ].join('\n'),
        coverImageUrl:
          'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80',
        tags: ['ppa', 'lease', 'installment'],
        status: 'PUBLISHED',
        isFeatured: true,
        publishedAt: utcDate(2026, 3, 14),
      },
      {
        authorId: admin.id,
        title: 'Checklist bàn giao hệ thống sau khi lắp đặt',
        slug: 'checklist-ban-giao-he-thong-sau-khi-lap-dat',
        excerpt:
          'Nội dung mẫu để đội vận hành dùng khi bàn giao cho khách: hợp đồng, serial inverter, tài khoản monitor và lịch bảo trì.',
        content: [
          '1. Xác nhận serial inverter, số lượng tấm pin và sơ đồ đấu nối.',
          '2. Bàn giao tài khoản monitor và plant ID cho khách hàng.',
          '3. Chốt mẫu hóa đơn, lịch thanh toán và kênh hỗ trợ.',
          '4. Kiểm tra dashboard khách hàng hiển thị đủ sản lượng, tiêu thụ và lịch sử thanh toán.',
        ].join('\n'),
        coverImageUrl:
          'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1600&q=80',
        tags: ['operations', 'handover'],
        status: 'DRAFT',
        isFeatured: false,
      },
    ],
  });

  const servicePackages = {
    ppa: await prisma.servicePackage.create({
      data: {
        packageCode: 'PPA-PREMIUM',
        name: 'PPA Premium Rooftop',
        contractType: 'PPA_KWH',
        shortDescription: 'Goi ban dien mat troi theo san luong cho rooftop doanh nghiep.',
        pricePerKwh: 2500,
        defaultTermMonths: 120,
        billingRule: 'PV_MONTHLY_GENERATION',
        maintenanceFee: 180000,
        annualEscalationRate: 3,
        vatRate: 8,
        lateFeeRate: 1.2,
        earlyDiscountRate: 0.8,
        isActive: true,
      },
    }),
    lease: await prisma.servicePackage.create({
      data: {
        packageCode: 'LEASE-FLEX-36',
        name: 'Lease Flex 36',
        contractType: 'LEASE',
        shortDescription: 'Goi thue he thong co bao tri dinh ky va bao cao van hanh.',
        fixedMonthlyFee: 6500000,
        defaultTermMonths: 36,
        billingRule: 'FIXED_MONTHLY_FEE',
        maintenanceFee: 320000,
        annualEscalationRate: 2.5,
        vatRate: 8,
        lateFeeRate: 1,
        isActive: true,
      },
    }),
    hybrid: await prisma.servicePackage.create({
      data: {
        packageCode: 'HYBRID-COMMERCE',
        name: 'Hybrid Commerce',
        contractType: 'HYBRID',
        shortDescription: 'Mo hinh ket hop san luong, phi co dinh va lop luu tru.',
        pricePerKwh: 1850,
        fixedMonthlyFee: 4200000,
        defaultTermMonths: 84,
        billingRule: 'PV_MONTHLY_PLUS_FIXED',
        maintenanceFee: 450000,
        annualEscalationRate: 4,
        vatRate: 8,
        lateFeeRate: 1.5,
        isActive: true,
      },
    }),
    installment: await prisma.servicePackage.create({
      data: {
        packageCode: 'INSTALLMENT-24M',
        name: 'Installment 24M',
        contractType: 'INSTALLMENT',
        shortDescription: 'Goi tra gop cho cong trinh can ngan sach deu hang thang.',
        fixedMonthlyFee: 9800000,
        defaultTermMonths: 24,
        billingRule: 'INSTALLMENT_FIXED',
        maintenanceFee: 250000,
        vatRate: 8,
        lateFeeRate: 1.2,
        isActive: true,
      },
    }),
  };

  const portfolio = [
    {
      email: 'customer@example.com',
      fullName: 'Nguyen Van A',
      phone: '0900000000',
      companyName: 'Cafe Nang Xanh',
      address: 'Phu My Hung, District 7, HCMC',
      system: {
        systemCode: 'SYS-DEMO-001',
        name: 'Cafe Nang Xanh Rooftop',
        capacityKwp: 12.4,
        panelCount: 20,
        panelBrand: 'Jinko',
        panelModel: 'Tiger Neo 620W',
        inverterBrand: 'Deye',
        inverterModel: 'SUN-10K-SG04LP3',
        location: 'District 7, HCMC',
        installDate: utcDate(2025, 1, 15),
        status: 'ACTIVE' as const,
      },
      contract: {
        contractNumber: 'CTR-DEMO-001',
        type: 'PPA_KWH' as ContractType,
        packageKey: 'ppa' as const,
        startDate: utcDate(2025, 1, 20),
        termMonths: 60,
        pricePerKwh: 2500,
        vatRate: 8,
        principalAmount: 0,
      },
      baseLoad: 30,
      usageByMonth: { '2026-01': 520, '2026-02': 488, '2026-03': 536 },
    },
    {
      email: 'villa@example.com',
      fullName: 'Tran Thi B',
      phone: '0911000000',
      companyName: 'Villa Sunlake',
      address: 'Nha Be, HCMC',
      system: {
        systemCode: 'SYS-DEMO-002',
        name: 'Villa Hybrid Estate',
        capacityKwp: 18.6,
        panelCount: 30,
        panelBrand: 'Longi',
        panelModel: 'Hi-MO X6',
        inverterBrand: 'Huawei',
        inverterModel: 'SUN2000-20KTL',
        location: 'Nha Be, HCMC',
        installDate: utcDate(2025, 6, 10),
        status: 'ACTIVE' as const,
      },
      contract: {
        contractNumber: 'CTR-DEMO-002',
        type: 'LEASE' as ContractType,
        packageKey: 'lease' as const,
        startDate: utcDate(2025, 6, 15),
        termMonths: 36,
        fixedMonthlyFee: 6500000,
        vatRate: 8,
        principalAmount: 0,
      },
      baseLoad: 42,
      usageByMonth: { '2026-01': 610, '2026-02': 590, '2026-03': 625 },
    },
    {
      email: 'factory@example.com',
      fullName: 'Le Quoc C',
      phone: '0933000000',
      companyName: 'Xuong Moka',
      address: 'Binh Chanh, HCMC',
      system: {
        systemCode: 'SYS-DEMO-003',
        name: 'Factory Hybrid Cluster',
        capacityKwp: 83.2,
        panelCount: 134,
        panelBrand: 'JA Solar',
        panelModel: 'DeepBlue 4.0 Pro',
        inverterBrand: 'Solis',
        inverterModel: 'S5-GC50K',
        location: 'Binh Chanh, HCMC',
        installDate: utcDate(2024, 11, 20),
        status: 'ACTIVE' as const,
      },
      contract: {
        contractNumber: 'CTR-DEMO-003',
        type: 'HYBRID' as ContractType,
        packageKey: 'hybrid' as const,
        startDate: utcDate(2024, 12, 1),
        termMonths: 48,
        fixedMonthlyFee: 4200000,
        pricePerKwh: 1850,
        vatRate: 8,
        principalAmount: 0,
      },
      baseLoad: 155,
      usageByMonth: { '2026-01': 2640, '2026-02': 2515, '2026-03': 2725 },
    },
    {
      email: 'school@example.com',
      fullName: 'Pham Thi D',
      phone: '0944000000',
      companyName: 'Truong Sao Mai',
      address: 'Thu Duc, HCMC',
      system: {
        systemCode: 'SYS-DEMO-004',
        name: 'Campus Installment Plant',
        capacityKwp: 25.5,
        panelCount: 42,
        panelBrand: 'Canadian Solar',
        panelModel: 'TOPHiKu6',
        inverterBrand: 'Growatt',
        inverterModel: 'MAX 25000TL3-X',
        location: 'Thu Duc, HCMC',
        installDate: utcDate(2025, 3, 28),
        status: 'ACTIVE' as const,
      },
      contract: {
        contractNumber: 'CTR-DEMO-004',
        type: 'INSTALLMENT' as ContractType,
        packageKey: 'installment' as const,
        startDate: utcDate(2025, 4, 1),
        termMonths: 24,
        fixedMonthlyFee: 9800000,
        interestRate: 8.5,
        vatRate: 8,
        principalAmount: 180000000,
      },
      baseLoad: 58,
      usageByMonth: { '2026-01': 920, '2026-02': 870, '2026-03': 960 },
    },
  ];

  let invoiceSequence = 1;

  for (const [customerIndex, account] of portfolio.entries()) {
    const user = await prisma.user.create({
      data: {
      email: normalizeEmail(account.email),
      fullName: account.fullName,
      phone: normalizeVietnamPhone(account.phone),
      phoneVerifiedAt: normalizeVietnamPhone(account.phone) ? new Date() : null,
      passwordHash: adminPasswordHash,
      roleId: customerRole.id,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        customerCode: `CUS-DEMO-${String(customerIndex + 1).padStart(3, '0')}`,
        companyName: account.companyName,
        installationAddress: account.address,
        billingAddress: account.address,
      },
    });

    const system = await prisma.solarSystem.create({
      data: {
        customerId: customer.id,
        ...account.system,
      },
    });

    const packageRef = servicePackages[account.contract.packageKey];
    const contract = await prisma.contract.create({
      data: {
        customerId: customer.id,
        solarSystemId: system.id,
        servicePackageId: packageRef.id,
        contractNumber: account.contract.contractNumber,
        type: account.contract.type,
        status: 'ACTIVE',
        startDate: account.contract.startDate,
        termMonths: account.contract.termMonths,
        pricePerKwh: account.contract.pricePerKwh,
        fixedMonthlyFee: account.contract.fixedMonthlyFee,
        interestRate: account.contract.interestRate,
        vatRate: account.contract.vatRate,
        contractFileUrl: `/contracts/${account.contract.contractNumber}.pdf`,
      },
    });

    const energyRecords = buildEnergyRecords(
      system.id,
      account.system.capacityKwp,
      account.baseLoad,
      90,
    );

    await prisma.energyRecord.createMany({
      data: energyRecords as any[],
    });

    const months = ['2026-01', '2026-02', '2026-03'];

    for (const monthLabel of months) {
      const [yearText, monthText] = monthLabel.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      const usageKwh = account.usageByMonth[monthLabel as keyof typeof account.usageByMonth];

      const packageConfig = servicePackages[account.contract.packageKey];
      const invoicePayload = buildInvoicePayload({
        contractType: account.contract.type,
        usageKwh,
        pricePerKwh: account.contract.pricePerKwh || Number(packageConfig.pricePerKwh || 0),
        fixedMonthlyFee: account.contract.fixedMonthlyFee || Number(packageConfig.fixedMonthlyFee || 0),
        maintenanceFee: Number(packageConfig.maintenanceFee || 0),
        interestRate: account.contract.interestRate || 0,
        termMonths: account.contract.termMonths,
        principalAmount: account.contract.principalAmount || 0,
        vatRate: account.contract.vatRate || Number(packageConfig.vatRate || 8),
      });

      const dueDate =
        month === 3 ? utcDate(2026, 3, 25) : utcDate(year, month + 1, 10);

      const invoice = await prisma.invoice.create({
        data: {
          customerId: customer.id,
          contractId: contract.id,
          invoiceNumber: `INV-${year}${String(month).padStart(2, '0')}-${String(invoiceSequence).padStart(3, '0')}`,
          billingMonth: month,
          billingYear: year,
          issuedAt: utcDate(year, month, 2),
          dueDate,
          subtotal: invoicePayload.subtotal,
          vatAmount: invoicePayload.vatAmount,
          penaltyAmount: invoicePayload.penaltyAmount,
          discountAmount: invoicePayload.discountAmount,
          totalAmount: invoicePayload.totalAmount,
          paidAmount: month === 3 && account.email === 'customer@example.com' ? 0 : invoicePayload.totalAmount,
          status:
            month === 3 && account.email === 'customer@example.com'
              ? 'ISSUED'
              : 'PAID',
          items: {
            create: invoicePayload.items,
          },
        },
      });

      if (invoice.status === 'PAID') {
        await prisma.payment.create({
          data: {
            customerId: customer.id,
            invoiceId: invoice.id,
            paymentCode: `PAY-${year}${String(month).padStart(2, '0')}-${String(invoiceSequence).padStart(3, '0')}`,
            gateway: month % 2 === 0 ? 'MoMo' : 'VNPay',
            method: month % 2 === 0 ? 'MOMO_QR' : 'VNPAY_QR',
            amount: invoice.totalAmount,
            status: 'SUCCESS',
            paidAt: utcDate(year, month, month === 3 ? 16 : 8),
            metadata: {
              providerResponse: 'mock_success',
            },
          },
        });
      }

      invoiceSequence += 1;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        customerId: customer.id,
        title:
          account.email === 'customer@example.com'
            ? 'Need inverter inspection at noon'
            : 'Need billing clarification',
        description:
          account.email === 'customer@example.com'
            ? 'The monitoring app shows a short warning around 12:30.'
            : 'Please explain maintenance fee breakdown on the latest invoice.',
        status: account.email === 'customer@example.com' ? 'OPEN' : 'IN_PROGRESS',
        priority:
          account.email === 'customer@example.com'
            ? TicketPriority.HIGH
            : TicketPriority.MEDIUM,
        messages: {
          create: [
            {
              senderName: account.fullName,
              senderRole: 'CUSTOMER',
              message:
                account.email === 'customer@example.com'
                  ? 'Please arrange a technician visit this week.'
                  : 'Please send a billing note for my accountant.',
            },
            {
              senderName: 'admin@example.com',
              senderRole: 'ADMIN',
              message: 'Operations team has received this request and is processing it.',
            },
          ],
        },
      },
    });

    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: 'Monthly dashboard updated',
          body: `March production data is ready for ${account.companyName}.`,
        },
        {
          userId: user.id,
          title: 'Billing reminder',
          body: 'A new invoice is available in your customer portal.',
        },
      ],
    });

    await prisma.auditLog.createMany({
      data: [
        {
          userId: admin.id,
          action: 'CUSTOMER_CREATED',
          entityType: 'Customer',
          entityId: customer.id,
          payload: {
            companyName: customer.companyName,
          },
        },
        {
          userId: admin.id,
          action: 'SOLAR_SYSTEM_CREATED',
          entityType: 'SolarSystem',
          entityId: system.id,
          payload: {
            systemCode: system.systemCode,
          },
        },
        {
          userId: admin.id,
          action: 'CONTRACT_CREATED',
          entityType: 'Contract',
          entityId: contract.id,
          payload: {
            contractNumber: contract.contractNumber,
          },
        },
        {
          userId: admin.id,
          action: 'SUPPORT_TICKET_OPENED',
          entityType: 'SupportTicket',
          entityId: ticket.id,
          payload: {
            title: ticket.title,
          },
        },
      ],
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: superAdmin.id,
        title: 'Seed completed',
        body: 'The demo portfolio has been refreshed successfully.',
      },
      {
        userId: admin.id,
        title: 'Invoices generated',
        body: 'March billing cycle is ready for customer follow-up.',
      },
    ],
  });

  console.log('Seed completed for Moka Solar platform');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
