import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  MOKA_DEFAULT_DISCOUNT_AMOUNT,
  MOKA_DEFAULT_PPA_UNIT_PRICE,
  MOKA_DEFAULT_VAT_RATE,
} from '../common/config/moka-billing-policy';
import {
  calculateVatAmount,
  deriveVatRateFromAmounts,
  normalizePercentRate,
  roundMoney,
} from '../common/helpers/billing.helper';
import {
  generateCode,
  getMonthDateRange,
  toNumber,
} from '../common/helpers/domain.helper';
import {
  aggregateOperationalPeriodMetrics,
  buildOperationalPeriodKey,
  extractOperationalPeriodMetrics,
} from '../common/helpers/operational-period.helper';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListMonthlyPvBillingsDto } from './dto/list-monthly-pv-billings.dto';
import { SyncMonthlyPvBillingDto } from './dto/sync-monthly-pv-billing.dto';
import { UpdateMonthlyPvBillingDto } from './dto/update-monthly-pv-billing.dto';

type BillingRecordWithRelations = any;

type AmountBreakdown = {
  pvGenerationKwh: number;
  billableKwh: number;
  unitPrice: number;
  subtotalAmount: number;
  vatRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  source: string;
};

const MUTABLE_INVOICE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CANCELLED,
]);

@Injectable()
export class MonthlyPvBillingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(query: ListMonthlyPvBillingsDto) {
    const records = await this.prisma.monthlyPvBilling.findMany({
      where: {
        deletedAt: null,
        ...(query.systemId ? { solarSystemId: query.systemId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(query.year ? { year: query.year } : {}),
      },
      include: this.includeRelations(),
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { syncTime: 'desc' }],
    });

    return this.attachPeriodMetrics(records);
  }

  async findOne(id: string) {
    const record = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!record) {
      throw new NotFoundException('Monthly PV billing record not found');
    }

    const [serialized] = await this.attachPeriodMetrics([record]);
    return serialized;
  }

  async sync(systemId: string, dto: SyncMonthlyPvBillingDto, actorId?: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Solar system not found');
    }

    if (!system.customerId) {
      throw new BadRequestException(
        'He thong chua duoc gan khach hang. Vui long map customer truoc khi tao billing thang.',
      );
    }

    const existing = await this.prisma.monthlyPvBilling.findUnique({
      where: {
        solarSystemId_month_year: {
          solarSystemId: systemId,
          month: dto.month,
          year: dto.year,
        },
      },
      include: {
        invoice: true,
      },
    });

    this.ensureRecordIsMutable(existing?.invoice);

    const contract = dto.contractId
      ? await this.prisma.contract.findFirst({
          where: {
            id: dto.contractId,
            deletedAt: null,
          },
          include: {
            servicePackage: true,
          },
        })
      : await this.resolveContract(systemId, dto.month, dto.year);
    const amounts = await this.calculateAmounts(systemId, dto, existing, contract);
    const syncTime = new Date();
    const source = dto.source?.trim() || amounts.source;

    const record = await this.prisma.monthlyPvBilling.upsert({
      where: {
        solarSystemId_month_year: {
          solarSystemId: systemId,
          month: dto.month,
          year: dto.year,
        },
      },
      update: {
        customerId: system.customerId,
        contractId: contract?.id || null,
        pvGenerationKwh: amounts.pvGenerationKwh,
        billableKwh: amounts.billableKwh,
        unitPrice: amounts.unitPrice,
        subtotalAmount: amounts.subtotalAmount,
        vatRate: amounts.vatRate,
        taxAmount: amounts.taxAmount,
        discountAmount: amounts.discountAmount,
        totalAmount: amounts.totalAmount,
        syncTime,
        source,
        note: dto.note?.trim() || null,
        deletedAt: null,
      },
      create: {
        solarSystemId: systemId,
        customerId: system.customerId,
        contractId: contract?.id || null,
        month: dto.month,
        year: dto.year,
        pvGenerationKwh: amounts.pvGenerationKwh,
        billableKwh: amounts.billableKwh,
        unitPrice: amounts.unitPrice,
        subtotalAmount: amounts.subtotalAmount,
        vatRate: amounts.vatRate,
        taxAmount: amounts.taxAmount,
        discountAmount: amounts.discountAmount,
        totalAmount: amounts.totalAmount,
        syncTime,
        source,
        note: dto.note?.trim() || null,
      },
      include: this.includeRelations(),
    });

    if (record.invoiceId) {
      await this.syncLinkedInvoice(record);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_PV_BILLING_SYNCED',
      entityType: 'MonthlyPvBilling',
      entityId: record.id,
      payload: {
        solarSystemId: systemId,
        customerId: system.customerId,
        month: dto.month,
        year: dto.year,
        source,
      },
    });

    return this.findOne(record.id);
  }

  async update(id: string, dto: UpdateMonthlyPvBillingDto, actorId?: string) {
    const existing = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        invoice: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Monthly PV billing record not found');
    }

    this.ensureRecordIsMutable(existing.invoice);

    const nextMonth = dto.month ?? existing.month;
    const nextYear = dto.year ?? existing.year;

    if (nextMonth !== existing.month || nextYear !== existing.year) {
      const conflict = await this.prisma.monthlyPvBilling.findFirst({
        where: {
          solarSystemId: existing.solarSystemId,
          month: nextMonth,
          year: nextYear,
          deletedAt: null,
          NOT: {
            id,
          },
        },
      });

      if (conflict) {
        throw new BadRequestException(
          'Thang nay da co ban ghi PV cho he thong. Vui long dong bo hoac chinh sua ban ghi hien co.',
        );
      }
    }

    const contract =
      existing.contractId
        ? await this.prisma.contract.findFirst({
            where: {
              id: existing.contractId,
              deletedAt: null,
            },
            include: {
              servicePackage: true,
            },
          })
        : await this.resolveContract(existing.solarSystemId, nextMonth, nextYear);

    const amounts = await this.calculateAmounts(existing.solarSystemId, dto, existing, contract);

    const updated = await this.prisma.monthlyPvBilling.update({
      where: { id },
      data: {
        month: nextMonth,
        year: nextYear,
        contractId: contract?.id || null,
        pvGenerationKwh: amounts.pvGenerationKwh,
        billableKwh: amounts.billableKwh,
        unitPrice: amounts.unitPrice,
        subtotalAmount: amounts.subtotalAmount,
        vatRate: amounts.vatRate,
        taxAmount: amounts.taxAmount,
        discountAmount: amounts.discountAmount,
        totalAmount: amounts.totalAmount,
        syncTime: new Date(),
        source: dto.source?.trim() || existing.source,
        note: dto.note !== undefined ? dto.note?.trim() || null : existing.note,
      },
      include: this.includeRelations(),
    });

    if (updated.invoiceId) {
      await this.syncLinkedInvoice(updated);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_PV_BILLING_UPDATED',
      entityType: 'MonthlyPvBilling',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return this.findOne(id);
  }

  async remove(id: string, actorId?: string) {
    const existing = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        invoice: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Monthly PV billing record not found');
    }

    if (existing.invoiceId) {
      throw new BadRequestException(
        'Khong the xoa ban ghi thang da phat hanh hoa don. Hay xu ly hoa don truoc khi xoa.',
      );
    }

    await this.prisma.monthlyPvBilling.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_PV_BILLING_DELETED',
      entityType: 'MonthlyPvBilling',
      entityId: id,
    });

    return { success: true };
  }

  async generateInvoice(id: string, actorId?: string) {
    const record = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!record) {
      throw new NotFoundException('Monthly PV billing record not found');
    }

    if (record.invoiceId && record.invoice) {
      return {
        record: this.serialize(record),
        invoice: record.invoice,
      };
    }

    const contract =
      record.contract ||
      (await this.resolveContract(record.solarSystemId, record.month, record.year));

    if (!contract) {
      throw new BadRequestException(
        'Khong tim thay hop dong active cho he thong nay. Vui long gan hop dong truoc khi phat hanh hoa don.',
      );
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        customerId: record.customerId,
        contractId: contract.id,
        invoiceNumber: generateCode(
          `INV-PV-${record.year}${String(record.month).padStart(2, '0')}`,
        ),
        billingMonth: record.month,
        billingYear: record.year,
        issuedAt: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subtotal: record.subtotalAmount,
        vatRate: record.vatRate,
        vatAmount: record.taxAmount,
        penaltyAmount: 0,
        discountAmount: record.discountAmount,
        totalAmount: record.totalAmount,
        status: InvoiceStatus.ISSUED,
        items: {
          create: [
            {
              description: this.buildInvoiceDescription(record),
              quantity: record.billableKwh,
              unitPrice: record.unitPrice,
              amount: record.subtotalAmount,
            },
          ],
        },
      },
      include: {
        items: true,
        payments: true,
      },
    });

    await this.prisma.monthlyPvBilling.update({
      where: { id },
      data: {
        contractId: contract.id,
        invoiceId: invoice.id,
      },
    });

    await this.notificationsService.create({
      userId: record.customer.userId,
      title: 'Hoa don ky moi da san sang',
      body: `Hoa don ${invoice.invoiceNumber} cho ky ${String(record.month).padStart(2, '0')}/${record.year} da duoc phat hanh.`,
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_PV_BILLING_INVOICED',
      entityType: 'MonthlyPvBilling',
      entityId: id,
      payload: {
        invoiceId: invoice.id,
      },
    });

    return {
      record: await this.findOne(id),
      invoice,
    };
  }

  private includeRelations() {
    return {
      solarSystem: {
        include: {
          customer: {
            include: {
              user: true,
            },
          },
        },
      },
      customer: {
        include: {
          user: true,
        },
      },
      contract: {
        include: {
          servicePackage: true,
        },
      },
      invoice: {
        include: {
          items: true,
          payments: true,
        },
      },
    };
  }

  private async attachPeriodMetrics(records: BillingRecordWithRelations[]) {
    if (!records.length) {
      return [];
    }

    const periodRecords = await this.prisma.monthlyEnergyRecord.findMany({
      where: {
        deletedAt: null,
        OR: records.map((record) => ({
          solarSystemId: record.solarSystemId,
          year: record.year,
          month: record.month,
        })),
      },
    });

    const periodMap = new Map(
      periodRecords
        .map((record) => [
          buildOperationalPeriodKey(record.solarSystemId, record.year, record.month),
          record,
        ] as const)
        .filter((entry): entry is [string, any] => Boolean(entry[0])),
    );

    return records.map((record) => {
      const serialized = this.serialize(record);
      const periodRecord =
        periodMap.get(
          buildOperationalPeriodKey(record.solarSystemId, record.year, record.month) || '',
        ) || null;

      return {
        ...serialized,
        periodMetrics: aggregateOperationalPeriodMetrics(
          periodRecord ? [periodRecord] : [],
          {
            year: record.year,
            month: record.month,
            source: record.source,
            syncTime: record.syncTime,
          },
        ) || extractOperationalPeriodMetrics(periodRecord),
      };
    });
  }

  private async resolveContract(systemId: string, month: number, year: number) {
    const { from, to } = getMonthDateRange(year, month);
    const exactContract = await this.prisma.contract.findFirst({
      where: {
        solarSystemId: systemId,
        status: 'ACTIVE',
        deletedAt: null,
        startDate: {
          lte: to,
        },
        OR: [
          { endDate: null },
          {
            endDate: {
              gte: from,
            },
          },
        ],
      },
      include: {
        servicePackage: true,
      },
      orderBy: [{ startDate: 'desc' }],
    });

    if (exactContract) {
      return exactContract;
    }

    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      select: {
        customerId: true,
        stationId: true,
      },
    });

    if (!system?.customerId) {
      return null;
    }

    const customerContracts = await this.prisma.contract.findMany({
      where: {
        customerId: system.customerId,
        status: 'ACTIVE',
        deletedAt: null,
        startDate: {
          lte: to,
        },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      include: {
        servicePackage: true,
        solarSystem: {
          select: {
            id: true,
            stationId: true,
          },
        },
      },
      orderBy: [{ startDate: 'desc' }],
    });

    if (customerContracts.length === 1) {
      return customerContracts[0];
    }

    if (system.stationId) {
      const sameStationContract = customerContracts.find(
        (contract) => contract.solarSystem?.stationId === system.stationId,
      );

      if (sameStationContract) {
        return sameStationContract;
      }
    }

    return null;
  }

  private async calculateAmounts(
    systemId: string,
    dto: SyncMonthlyPvBillingDto | UpdateMonthlyPvBillingDto,
    existing?: {
      month?: number;
      year?: number;
      unitPrice?: unknown;
      subtotalAmount?: unknown;
      vatRate?: unknown;
      taxAmount?: unknown;
      discountAmount?: unknown;
    } | null,
    contract?: any,
  ): Promise<AmountBreakdown> {
    const month = dto.month ?? existing?.month;
    const year = dto.year ?? existing?.year;

    if (!month || !year) {
      throw new BadRequestException('Thieu thang hoac nam de tinh tien.');
    }

    const pvResolution =
      dto.pvGenerationKwh !== undefined
        ? {
            value: dto.pvGenerationKwh,
            source: 'MANUAL',
          }
        : await this.resolvePvGeneration(systemId, month, year);
    const pvGenerationKwh = roundMoney(pvResolution.value);

    if (pvGenerationKwh <= 0) {
      throw new BadRequestException(
        'Chua co du lieu san luong PV thang. Hay dong bo daily records truoc hoac nhap gia tri PV thang.',
      );
    }

    const pricingDefaults = await this.resolvePricingDefaults(systemId);
    const unitPrice = roundMoney(
      dto.unitPrice ??
        this.optionalNumber(existing?.unitPrice) ??
        pricingDefaults.unitPrice ??
        this.optionalNumber(contract?.pricePerKwh) ??
        this.optionalNumber(contract?.servicePackage?.pricePerKwh) ??
        0,
    );

    if (unitPrice <= 0) {
      throw new BadRequestException(
        'Thieu don gia tinh tien. Vui long nhap don gia hoac cau hinh gia tren hop dong/goi dich vu.',
      );
    }

    const subtotalAmount = roundMoney(pvGenerationKwh * unitPrice);
    const vatRate = normalizePercentRate(
      dto.vatRate ??
        dto.taxRate ??
        pricingDefaults.vatRate ??
        this.optionalNumber(contract?.vatRate) ??
        this.optionalNumber(contract?.servicePackage?.vatRate) ??
        this.optionalNumber(existing?.vatRate) ??
        deriveVatRateFromAmounts(existing?.subtotalAmount, existing?.taxAmount, MOKA_DEFAULT_VAT_RATE),
      MOKA_DEFAULT_VAT_RATE,
    );
    const taxAmount = calculateVatAmount(subtotalAmount, vatRate);
    const discountAmount = roundMoney(
      dto.discountAmount ??
        this.optionalNumber(existing?.discountAmount) ??
        pricingDefaults.discountAmount ??
        0,
    );
    const totalAmount = roundMoney(subtotalAmount + taxAmount - discountAmount);

    return {
      pvGenerationKwh,
      billableKwh: pvGenerationKwh,
      unitPrice,
      subtotalAmount,
      vatRate,
      taxAmount,
      discountAmount,
      totalAmount,
      source: pvResolution.source,
    };
  }

  private async resolvePricingDefaults(systemId: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      select: {
        defaultUnitPrice: true,
        defaultVatRate: true,
        defaultTaxAmount: true,
        defaultDiscountAmount: true,
        customer: {
          select: {
            defaultUnitPrice: true,
            defaultVatRate: true,
            defaultTaxAmount: true,
            defaultDiscountAmount: true,
          },
        },
      },
    });

    return {
      unitPrice:
        this.optionalNumber(system?.defaultUnitPrice) ||
        this.optionalNumber(system?.customer?.defaultUnitPrice) ||
        MOKA_DEFAULT_PPA_UNIT_PRICE,
      vatRate:
        this.optionalNumber(system?.defaultVatRate) ??
        this.optionalNumber(system?.customer?.defaultVatRate) ??
        deriveVatRateFromAmounts(100, system?.defaultTaxAmount, NaN) ??
        deriveVatRateFromAmounts(100, system?.customer?.defaultTaxAmount, NaN) ??
        MOKA_DEFAULT_VAT_RATE,
      discountAmount:
        this.optionalNumber(system?.defaultDiscountAmount) ||
        this.optionalNumber(system?.customer?.defaultDiscountAmount) ||
        MOKA_DEFAULT_DISCOUNT_AMOUNT,
    };
  }

  private async resolvePvGeneration(systemId: string, month: number, year: number) {
    const { from, to } = getMonthDateRange(year, month);
    const result = await this.prisma.energyRecord.aggregate({
      where: {
        solarSystemId: systemId,
        recordDate: {
          gte: from,
          lte: to,
        },
      },
      _sum: {
        solarGeneratedKwh: true,
      },
    });

    const aggregatedPv = toNumber(result._sum.solarGeneratedKwh);
    if (aggregatedPv > 0) {
      return {
        value: aggregatedPv,
        source: 'ENERGY_RECORD_AGGREGATE',
      };
    }

    const monitoredPv = await this.resolvePvFromMonitorSnapshot(systemId, month, year);
    if (monitoredPv > 0) {
      return {
        value: monitoredPv,
        source: 'MONITOR_SNAPSHOT',
      };
    }

    return {
      value: 0,
      source: 'EMPTY',
    };
  }

  private async resolvePvFromMonitorSnapshot(systemId: string, month: number, year: number) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      select: {
        latestMonitorSnapshot: true,
        latestMonitorAt: true,
      },
    });

    if (!system?.latestMonitorSnapshot) {
      return 0;
    }

    const snapshot = system.latestMonitorSnapshot as Record<string, any>;
    const snapshotDate = system.latestMonitorAt
      ? new Date(system.latestMonitorAt)
      : snapshot?.fetchedAt
        ? new Date(snapshot.fetchedAt)
        : null;

    if (
      snapshotDate &&
      !Number.isNaN(snapshotDate.getTime()) &&
      (snapshotDate.getMonth() + 1 !== month || snapshotDate.getFullYear() !== year)
    ) {
      return 0;
    }

    const candidates = [
      snapshot?.monthGeneratedKwh,
      snapshot?.monthGenerationKwh,
      snapshot?.month_generation,
      snapshot?.thisMonthGeneratedKwh,
      snapshot?.thisMonthPvKwh,
      snapshot?.kpi?.month_generation,
      snapshot?.kpi?.monthGeneration,
      snapshot?.raw?.kpi?.month_generation,
      snapshot?.raw?.kpi?.monthGeneration,
      snapshot?.raw?.inverter?.emonth,
      snapshot?.raw?.inverter?.d?.eMonth,
      snapshot?.raw?.inverter?.invert_full?.emonth,
      snapshot?.raw?.inverter?.invert_full?.thismonthetotle,
    ];

    for (const candidate of candidates) {
      const value = toNumber(candidate);
      if (value > 0) {
        return value;
      }
    }

    return 0;
  }

  private ensureRecordIsMutable(invoice?: { status: InvoiceStatus } | null) {
    if (!invoice) {
      return;
    }

    if (!MUTABLE_INVOICE_STATUSES.has(invoice.status)) {
      throw new BadRequestException(
        'Ban ghi thang nay da co hoa don dang duoc thanh toan hoac da thanh toan. Vui long dieu chinh hoa don truoc khi dong bo lai.',
      );
    }
  }

  private async syncLinkedInvoice(record: BillingRecordWithRelations) {
    if (!record.invoiceId || !record.invoice) {
      return;
    }

    this.ensureRecordIsMutable(record.invoice);

    await this.prisma.invoice.update({
      where: { id: record.invoiceId },
      data: {
        contractId: record.contractId || record.invoice.contractId,
        billingMonth: record.month,
        billingYear: record.year,
        subtotal: record.subtotalAmount,
        vatRate: record.vatRate,
        vatAmount: record.taxAmount,
        discountAmount: record.discountAmount,
        totalAmount: record.totalAmount,
        items: {
          deleteMany: {},
          create: [
            {
              description: this.buildInvoiceDescription(record),
              quantity: record.billableKwh,
              unitPrice: record.unitPrice,
              amount: record.subtotalAmount,
            },
          ],
        },
      },
    });
  }

  private buildInvoiceDescription(
    record: {
      month: number;
      year: number;
      billableKwh: unknown;
      solarSystem: {
        name: string;
      };
    },
  ) {
    const period = `${String(record.month).padStart(2, '0')}/${record.year}`;
    return `San luong PV thang ${period} - ${record.solarSystem.name}`;
  }

  private optionalNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private serialize(record: BillingRecordWithRelations) {
    return {
      ...record,
      pvGenerationKwh: toNumber(record.pvGenerationKwh),
      billableKwh: toNumber(record.billableKwh),
      unitPrice: toNumber(record.unitPrice),
      subtotalAmount: toNumber(record.subtotalAmount),
      vatRate: toNumber(record.vatRate),
      taxAmount: toNumber(record.taxAmount),
      discountAmount: toNumber(record.discountAmount),
      totalAmount: toNumber(record.totalAmount),
      contract: record.contract
        ? {
            ...record.contract,
            pricePerKwh: toNumber(record.contract.pricePerKwh),
            fixedMonthlyFee: toNumber(record.contract.fixedMonthlyFee),
            interestRate: toNumber(record.contract.interestRate),
            vatRate: toNumber(record.contract.vatRate),
            servicePackage: record.contract.servicePackage
              ? {
                  ...record.contract.servicePackage,
                  pricePerKwh: toNumber(record.contract.servicePackage.pricePerKwh),
                  fixedMonthlyFee: toNumber(record.contract.servicePackage.fixedMonthlyFee),
                  maintenanceFee: toNumber(record.contract.servicePackage.maintenanceFee),
                  annualEscalationRate: toNumber(
                    record.contract.servicePackage.annualEscalationRate,
                  ),
                  vatRate: toNumber(record.contract.servicePackage.vatRate),
                }
              : null,
          }
        : null,
      invoice: record.invoice
        ? {
            ...record.invoice,
            subtotal: toNumber(record.invoice.subtotal),
            vatRate: toNumber(record.invoice.vatRate),
            vatAmount: toNumber(record.invoice.vatAmount),
            penaltyAmount: toNumber(record.invoice.penaltyAmount),
            discountAmount: toNumber(record.invoice.discountAmount),
            totalAmount: toNumber(record.invoice.totalAmount),
            paidAmount: toNumber(record.invoice.paidAmount),
            items: record.invoice.items.map((item) => ({
              ...item,
              quantity: toNumber(item.quantity),
              unitPrice: toNumber(item.unitPrice),
              amount: toNumber(item.amount),
            })),
            payments: record.invoice.payments.map((payment) => ({
              ...payment,
              amount: toNumber(payment.amount),
            })),
          }
        : null,
      solarSystem: {
        id: record.solarSystem.id,
        customerId: record.solarSystem.customerId,
        systemCode: record.solarSystem.systemCode,
        name: record.solarSystem.name,
        systemType: record.solarSystem.systemType,
        capacityKwp: toNumber(record.solarSystem.capacityKwp),
        stationId: record.solarSystem.stationId,
        stationName: record.solarSystem.stationName,
        monitoringProvider: record.solarSystem.monitoringProvider,
        monitoringPlantId: record.solarSystem.monitoringPlantId,
        status: record.solarSystem.status,
        lastMonthlySyncAt: record.solarSystem.lastMonthlySyncAt,
        lastBillingSyncAt: record.solarSystem.lastBillingSyncAt,
        defaultVatRate: toNumber(record.solarSystem.defaultVatRate),
        customer: record.solarSystem.customer
          ? {
              id: record.solarSystem.customer.id,
              userId: record.solarSystem.customer.userId,
              customerCode: record.solarSystem.customer.customerCode,
              companyName: record.solarSystem.customer.companyName,
              installationAddress: record.solarSystem.customer.installationAddress,
              billingAddress: record.solarSystem.customer.billingAddress,
              status: record.solarSystem.customer.status,
              defaultVatRate: toNumber(record.solarSystem.customer.defaultVatRate),
              user: record.solarSystem.customer.user
                ? {
                    id: record.solarSystem.customer.user.id,
                    fullName: record.solarSystem.customer.user.fullName,
                    email: record.solarSystem.customer.user.email,
                    phone: record.solarSystem.customer.user.phone,
                  }
                : null,
            }
          : null,
      },
      customer: record.customer
        ? {
            id: record.customer.id,
            userId: record.customer.userId,
            customerCode: record.customer.customerCode,
            companyName: record.customer.companyName,
            installationAddress: record.customer.installationAddress,
            billingAddress: record.customer.billingAddress,
            status: record.customer.status,
            defaultVatRate: toNumber(record.customer.defaultVatRate),
            user: record.customer.user
              ? {
                  id: record.customer.user.id,
                  fullName: record.customer.user.fullName,
                  email: record.customer.user.email,
                  phone: record.customer.user.phone,
                }
              : null,
          }
        : null,
    };
  }
}
