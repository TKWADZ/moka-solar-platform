import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingDataQualityStatus,
  BillingSyncStatus,
  BillingWorkflowStatus,
  InvoiceStatus,
} from '@prisma/client';
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
  buildCumulativePvReadingLookups,
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
  InvoiceStatus.PENDING_REVIEW,
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CANCELLED,
]);

const BILLING_TIMEZONE = process.env.BILLING_TIMEZONE || 'Asia/Saigon';
const STABLE_AUTO_BILLING_PROVIDERS = new Set([
  'SEMS_PORTAL',
  'DEYE',
  'LUXPOWER',
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

  async listMine(customerId: string) {
    const records = await this.prisma.monthlyPvBilling.findMany({
      where: {
        customerId,
        deletedAt: null,
      },
      include: this.includeRelations(),
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { syncTime: 'desc' }],
      take: 12,
    });

    const currentMonthEstimate = await this.buildCurrentMonthEstimate(customerId);
    const items = currentMonthEstimate
      ? [
          currentMonthEstimate,
          ...records.filter(
            (record) =>
              record.month !== currentMonthEstimate.month ||
              record.year !== currentMonthEstimate.year ||
              record.solarSystemId !== currentMonthEstimate.solarSystemId,
          ),
        ]
      : records;

    return this.attachPeriodMetrics(items);
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
    const manualOverrideActive = Boolean(actorId && dto.pvGenerationKwh !== undefined);
    const manualOverrideReason = manualOverrideActive
      ? dto.manualOverrideReason?.trim() || dto.note?.trim() || 'Manual override do loi du lieu provider.'
      : null;

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
        manualOverrideKwh: manualOverrideActive
          ? amounts.pvGenerationKwh
          : existing?.manualOverrideKwh ?? undefined,
        manualOverrideReason: manualOverrideActive
          ? manualOverrideReason
          : existing?.manualOverrideReason ?? undefined,
        manualOverrideAt: manualOverrideActive
          ? syncTime
          : existing?.manualOverrideAt ?? undefined,
        manualOverrideByUserId: manualOverrideActive
          ? actorId
          : existing?.manualOverrideByUserId ?? undefined,
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
        manualOverrideKwh: manualOverrideActive ? amounts.pvGenerationKwh : null,
        manualOverrideReason: manualOverrideActive ? manualOverrideReason : null,
        manualOverrideAt: manualOverrideActive ? syncTime : null,
        manualOverrideByUserId: manualOverrideActive ? actorId : null,
        syncTime,
        source,
        note: dto.note?.trim() || null,
      },
      include: this.includeRelations(),
    });

    const refreshed = await this.refreshLifecycleForRecord(record.id, {
      actorId,
      forceSyncStatus: manualOverrideActive
        ? BillingSyncStatus.MANUAL_OVERRIDE
        : BillingSyncStatus.SYNCED,
      markAutoRetried: false,
    });

    if (refreshed.invoiceId) {
      await this.syncLinkedInvoice(refreshed);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: manualOverrideActive
        ? 'MONTHLY_PV_BILLING_MANUAL_OVERRIDE_APPLIED'
        : 'MONTHLY_PV_BILLING_SYNCED',
      entityType: 'MonthlyPvBilling',
      entityId: record.id,
      payload: {
        solarSystemId: systemId,
        customerId: system.customerId,
        month: dto.month,
        year: dto.year,
        source,
        ...(manualOverrideActive
          ? {
              manualOverrideKwh: amounts.pvGenerationKwh,
              manualOverrideReason,
            }
          : {}),
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
    const manualOverrideActive =
      dto.clearManualOverride === true
        ? false
        : Boolean(actorId && dto.pvGenerationKwh !== undefined);
    const manualOverrideReason = manualOverrideActive
      ? dto.manualOverrideReason?.trim() || dto.note?.trim() || 'Manual override do doi soat du lieu.'
      : null;

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
        manualOverrideKwh:
          dto.clearManualOverride === true
            ? null
            : manualOverrideActive
              ? amounts.pvGenerationKwh
              : existing.manualOverrideKwh,
        manualOverrideReason:
          dto.clearManualOverride === true
            ? null
            : manualOverrideActive
              ? manualOverrideReason
              : existing.manualOverrideReason,
        manualOverrideAt:
          dto.clearManualOverride === true
            ? null
            : manualOverrideActive
              ? new Date()
              : existing.manualOverrideAt,
        manualOverrideByUserId:
          dto.clearManualOverride === true
            ? null
            : manualOverrideActive
              ? actorId || null
              : existing.manualOverrideByUserId,
        syncTime: new Date(),
        source: dto.source?.trim() || existing.source,
        note: dto.note !== undefined ? dto.note?.trim() || null : existing.note,
      },
      include: this.includeRelations(),
    });

    const refreshed = await this.refreshLifecycleForRecord(updated.id, {
      actorId,
      forceSyncStatus:
        dto.clearManualOverride === true
          ? BillingSyncStatus.SYNCED
          : manualOverrideActive
            ? BillingSyncStatus.MANUAL_OVERRIDE
            : BillingSyncStatus.SYNCED,
      markAutoRetried: false,
    });

    if (refreshed.invoiceId) {
      await this.syncLinkedInvoice(refreshed);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action:
        dto.clearManualOverride === true
          ? 'MONTHLY_PV_BILLING_MANUAL_OVERRIDE_CLEARED'
          : manualOverrideActive
            ? 'MONTHLY_PV_BILLING_MANUAL_OVERRIDE_UPDATED'
            : 'MONTHLY_PV_BILLING_UPDATED',
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

  async generateInvoice(
    id: string,
    actorId?: string,
    options?: {
      autoSend?: boolean;
      bypassPeriodLock?: boolean;
    },
  ) {
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

    if (!options?.bypassPeriodLock && !this.isPastBillingPeriod(record.year, record.month)) {
      throw new BadRequestException(
        'Chi duoc tao hoa don chinh thuc sau khi ket thuc thang. Trong thang nay chi hien thi san luong va so tien tam tinh.',
      );
    }

    if (
      record.invoiceId &&
      record.invoice &&
      this.isFinalizedInvoiceStatus(record.invoice.status)
    ) {
      return {
        record: this.serialize(record),
        invoice: record.invoice,
        alreadyIssued: true,
      };
    }

    const latestRecord = await this.refreshLifecycleForRecord(record.id, {
      actorId,
      forceSyncStatus:
        record.manualOverrideKwh !== null && record.manualOverrideKwh !== undefined
          ? BillingSyncStatus.MANUAL_OVERRIDE
          : undefined,
      markAutoRetried: false,
    });

    const contract =
      latestRecord.contract ||
      (await this.resolveContract(latestRecord.solarSystemId, latestRecord.month, latestRecord.year));

    if (!contract) {
      throw new BadRequestException(
        'Khong tim thay hop dong active cho he thong nay. Vui long gan hop dong truoc khi phat hanh hoa don.',
      );
    }

    const draftInvoice = await this.createOrUpdateInvoiceDraft(latestRecord, contract);
    const targetInvoiceStatus = this.resolveInvoiceTargetStatus(latestRecord, {
      manualAction: Boolean(actorId),
    });
    const invoice = await this.transitionInvoiceToTargetStatus(
      draftInvoice.id,
      latestRecord,
      targetInvoiceStatus,
    );

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_PV_BILLING_INVOICED',
      entityType: 'MonthlyPvBilling',
      entityId: id,
      payload: {
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        dataQualityStatus: latestRecord.dataQualityStatus,
      },
    });

    if (
      options?.autoSend &&
      latestRecord.autoSendEligible &&
      invoice.status === InvoiceStatus.ISSUED
    ) {
      await this.notificationsService.create({
        userId: latestRecord.customer.userId,
        title: 'Hoa don ky moi da san sang',
        body: `Hoa don ${invoice.invoiceNumber} cho ky ${String(latestRecord.month).padStart(2, '0')}/${latestRecord.year} da duoc phat hanh.`,
      });
    }

    return {
      record: await this.findOne(id),
      invoice,
      alreadyIssued: false,
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
      manualOverrideByUser: true,
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

    const solarSystemIds = Array.from(
      new Set(
        records
          .map((record) => record.solarSystemId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [periodRecords, fullBillingHistory] = await Promise.all([
      this.prisma.monthlyEnergyRecord.findMany({
        where: {
          deletedAt: null,
          OR: records.map((record) => ({
            solarSystemId: record.solarSystemId,
            year: record.year,
            month: record.month,
          })),
        },
      }),
      solarSystemIds.length
        ? this.prisma.monthlyPvBilling.findMany({
            where: {
              deletedAt: null,
              solarSystemId: {
                in: solarSystemIds,
              },
            },
            select: {
              id: true,
              solarSystemId: true,
              contractId: true,
              year: true,
              month: true,
              pvGenerationKwh: true,
            },
            orderBy: [
              { solarSystemId: 'asc' },
              { year: 'asc' },
              { month: 'asc' },
              { id: 'asc' },
            ],
          })
        : Promise.resolve([]),
    ]);

    const cumulativeSourceRecords = [...fullBillingHistory];
    const knownRecordIds = new Set(fullBillingHistory.map((record) => record.id));

    for (const record of records) {
      if (!record.id || knownRecordIds.has(record.id)) {
        continue;
      }

      cumulativeSourceRecords.push({
        id: record.id,
        solarSystemId: record.solarSystemId,
        contractId: record.contractId,
        year: record.year,
        month: record.month,
        pvGenerationKwh: record.pvGenerationKwh,
      });
      knownRecordIds.add(record.id);
    }

    const cumulativeLookups = buildCumulativePvReadingLookups(cumulativeSourceRecords);

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
      const recordPeriodKey = buildOperationalPeriodKey(
        record.solarSystemId,
        record.year,
        record.month,
      );
      const periodRecord =
        periodMap.get(recordPeriodKey || '') || null;
      const basePeriodMetrics =
        aggregateOperationalPeriodMetrics(periodRecord ? [periodRecord] : [], {
          year: record.year,
          month: record.month,
          source: record.source,
          syncTime: record.syncTime,
        }) || extractOperationalPeriodMetrics(periodRecord);
      const cumulativeReading =
        cumulativeLookups.byRecordId.get(record.id) ||
        (recordPeriodKey
          ? cumulativeLookups.bySystemPeriod.get(recordPeriodKey) || null
          : null);

      return {
        ...serialized,
        periodMetrics: basePeriodMetrics
          ? {
              ...basePeriodMetrics,
              pvGenerationKwh:
                serialized.pvGenerationKwh ?? basePeriodMetrics.pvGenerationKwh,
              previousReading:
                cumulativeReading?.previousReading ??
                basePeriodMetrics.previousReading ??
                null,
              currentReading:
                cumulativeReading?.currentReading ??
                basePeriodMetrics.currentReading ??
                null,
            }
          : null,
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

    const clearManualOverride =
      'clearManualOverride' in dto && dto.clearManualOverride === true;
    const persistedManualOverride =
      clearManualOverride !== true
        ? this.optionalNumber((existing as { manualOverrideKwh?: unknown } | null)?.manualOverrideKwh)
        : null;
    const pvResolution =
      dto.pvGenerationKwh !== undefined
        ? {
            value: dto.pvGenerationKwh,
            source: 'MANUAL',
          }
        : persistedManualOverride !== null && persistedManualOverride > 0
          ? {
              value: persistedManualOverride,
              source: 'MANUAL_OVERRIDE',
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

  async refreshLifecycleForRecord(
    id: string,
    options?: {
      actorId?: string;
      forceSyncStatus?: BillingSyncStatus;
      markAutoRetried?: boolean;
    },
  ) {
    const record = await this.loadRecordById(id);
    const coverage = await this.computeCoverage(record.solarSystemId, record.month, record.year);
    const provider = this.resolveProviderCode(record);
    const sourceStable = this.isStableAutoBillingProvider(provider);
    const closedPeriod = this.isPastBillingPeriod(record.year, record.month);
    const hasManualOverride =
      record.manualOverrideKwh !== null && record.manualOverrideKwh !== undefined;
    const hasEnergyData = toNumber(record.pvGenerationKwh) > 0;

    let syncStatus =
      options?.forceSyncStatus ||
      (hasManualOverride
        ? BillingSyncStatus.MANUAL_OVERRIDE
        : hasEnergyData
          ? BillingSyncStatus.SYNCED
          : BillingSyncStatus.PENDING);
    let dataQualityStatus: BillingDataQualityStatus =
      BillingDataQualityStatus.UNKNOWN;
    let invoiceStatus: BillingWorkflowStatus | null = this.mapInvoiceToWorkflowStatus(
      record.invoice?.status,
    );
    let qualitySummary = 'Dang cho doi soat du lieu billing.';

    if (!closedPeriod) {
      dataQualityStatus = BillingDataQualityStatus.IN_PROGRESS;
      invoiceStatus = record.invoiceId ? invoiceStatus || BillingWorkflowStatus.DRAFT : BillingWorkflowStatus.ESTIMATE;
      qualitySummary =
        'Ky hien tai chi hien thi san luong va so tien tam tinh cho den khi ket thuc thang.';
    } else if (hasManualOverride) {
      dataQualityStatus = BillingDataQualityStatus.MANUAL_OVERRIDE;
      invoiceStatus = invoiceStatus || BillingWorkflowStatus.PENDING_REVIEW;
      syncStatus = options?.forceSyncStatus || BillingSyncStatus.MANUAL_OVERRIDE;
      qualitySummary =
        record.manualOverrideReason?.trim() ||
        'Dang dung manual override kWh do provider sync chua on dinh.';
    } else if (!hasEnergyData || coverage.availableDayCount === 0) {
      dataQualityStatus = BillingDataQualityStatus.INCOMPLETE;
      invoiceStatus = invoiceStatus || BillingWorkflowStatus.PENDING_REVIEW;
      syncStatus = options?.forceSyncStatus || BillingSyncStatus.RETRYING;
      qualitySummary = 'Chua co du lieu nang luong hop le cho thang truoc.';
    } else if (coverage.missingDayCount > 0) {
      dataQualityStatus = BillingDataQualityStatus.INCOMPLETE;
      invoiceStatus = invoiceStatus || BillingWorkflowStatus.PENDING_REVIEW;
      syncStatus = options?.forceSyncStatus || BillingSyncStatus.RETRYING;
      qualitySummary = `Thieu ${coverage.missingDayCount}/${coverage.expectedDayCount} ngay du lieu nang luong.`;
    } else if (!sourceStable) {
      dataQualityStatus = BillingDataQualityStatus.UNSTABLE_SOURCE;
      invoiceStatus = invoiceStatus || BillingWorkflowStatus.PENDING_REVIEW;
      qualitySummary = `Nguon ${this.providerLabel(provider)} can manual review truoc khi chot hoa don.`;
    } else {
      dataQualityStatus = BillingDataQualityStatus.OK;
      invoiceStatus = invoiceStatus || BillingWorkflowStatus.DRAFT;
      syncStatus = options?.forceSyncStatus || BillingSyncStatus.SYNCED;
      qualitySummary = 'Du du lieu nang luong va da san sang chot hoa don.';
    }

    const autoSendEligible =
      closedPeriod &&
      dataQualityStatus === BillingDataQualityStatus.OK &&
      sourceStable &&
      invoiceStatus !== BillingWorkflowStatus.PENDING_REVIEW;
    const updated = await this.prisma.monthlyPvBilling.update({
      where: { id },
      data: {
        contractId:
          record.contractId || (await this.resolveContract(record.solarSystemId, record.month, record.year))?.id || null,
        syncStatus,
        dataQualityStatus,
        invoiceStatus,
        expectedDayCount: coverage.expectedDayCount,
        availableDayCount: coverage.availableDayCount,
        missingDayCount: coverage.missingDayCount,
        dataSourceStable: sourceStable,
        autoSendEligible,
        qualitySummary,
        lastQualityCheckedAt: new Date(),
        lastAutoRetriedAt: options?.markAutoRetried ? new Date() : record.lastAutoRetriedAt,
        finalizedAt:
          invoiceStatus === BillingWorkflowStatus.ISSUED
            ? record.finalizedAt || new Date()
            : invoiceStatus === BillingWorkflowStatus.PAID ||
                invoiceStatus === BillingWorkflowStatus.PARTIAL ||
                invoiceStatus === BillingWorkflowStatus.OVERDUE
              ? record.finalizedAt
              : null,
      },
      include: this.includeRelations(),
    });

    return updated;
  }

  async refreshLifecycleForSystemPeriod(
    systemId: string,
    month: number,
    year: number,
    options?: {
      actorId?: string;
      markAutoRetried?: boolean;
    },
  ) {
    let record = await this.prisma.monthlyPvBilling.findUnique({
      where: {
        solarSystemId_month_year: {
          solarSystemId: systemId,
          month,
          year,
        },
      },
    });

    if (!record) {
      const pvResolution = await this.resolvePvGeneration(systemId, month, year);
      if (pvResolution.value <= 0) {
        return null;
      }
      const system = await this.prisma.solarSystem.findUnique({
        where: { id: systemId },
        select: { customerId: true },
      });

      if (!system?.customerId) {
        return null;
      }
      const contract = await this.resolveContract(systemId, month, year);
      const amounts = await this.calculateAmounts(
        systemId,
        {
          month,
          year,
          pvGenerationKwh: pvResolution.value,
          source: pvResolution.source,
        },
        null,
        contract,
      );

      record = await this.prisma.monthlyPvBilling.create({
        data: {
          solarSystemId: systemId,
          customerId: system.customerId,
          contractId: contract?.id || null,
          month,
          year,
          pvGenerationKwh: amounts.pvGenerationKwh,
          billableKwh: amounts.billableKwh,
          unitPrice: amounts.unitPrice,
          subtotalAmount: amounts.subtotalAmount,
          vatRate: amounts.vatRate,
          taxAmount: amounts.taxAmount,
          discountAmount: amounts.discountAmount,
          totalAmount: amounts.totalAmount,
          syncTime: new Date(),
          source: pvResolution.source,
          syncStatus: BillingSyncStatus.PENDING,
          dataQualityStatus: BillingDataQualityStatus.UNKNOWN,
          invoiceStatus: BillingWorkflowStatus.ESTIMATE,
        },
      });
    }

    return this.refreshLifecycleForRecord(record.id, options);
  }

  private async loadRecordById(id: string) {
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

    return record;
  }

  private async computeCoverage(solarSystemId: string, month: number, year: number) {
    const { from, to } = getMonthDateRange(year, month);
    const rows = await this.prisma.energyRecord.findMany({
      where: {
        solarSystemId,
        recordDate: {
          gte: from,
          lte: to,
        },
      },
      select: {
        recordDate: true,
      },
      orderBy: {
        recordDate: 'asc',
      },
    });
    const uniqueDays = new Set(
      rows.map((item) => item.recordDate.toISOString().slice(0, 10)),
    );
    const expectedDayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const availableDayCount = uniqueDays.size;

    return {
      expectedDayCount,
      availableDayCount,
      missingDayCount: Math.max(expectedDayCount - availableDayCount, 0),
    };
  }

  private resolveProviderCode(record: BillingRecordWithRelations) {
    return (
      record.solarSystem?.sourceSystem ||
      record.solarSystem?.monitoringProvider ||
      (typeof record.source === 'string' ? record.source.split('_').slice(0, 2).join('_') : '') ||
      'UNKNOWN'
    );
  }

  private providerLabel(provider: string) {
    switch (provider) {
      case 'SEMS_PORTAL':
        return 'SEMS Portal';
      case 'DEYE':
        return 'Deye OpenAPI';
      case 'SOLARMAN':
        return 'Solarman';
      case 'LUXPOWER':
        return 'LuxPower';
      default:
        return provider || 'monitor';
    }
  }

  private isStableAutoBillingProvider(provider: string) {
    return STABLE_AUTO_BILLING_PROVIDERS.has(provider);
  }

  private mapInvoiceToWorkflowStatus(status?: InvoiceStatus | null) {
    switch (status) {
      case InvoiceStatus.DRAFT:
        return BillingWorkflowStatus.DRAFT;
      case InvoiceStatus.PENDING_REVIEW:
        return BillingWorkflowStatus.PENDING_REVIEW;
      case InvoiceStatus.ISSUED:
        return BillingWorkflowStatus.ISSUED;
      case InvoiceStatus.PAID:
        return BillingWorkflowStatus.PAID;
      case InvoiceStatus.PARTIAL:
        return BillingWorkflowStatus.PARTIAL;
      case InvoiceStatus.OVERDUE:
        return BillingWorkflowStatus.OVERDUE;
      case InvoiceStatus.CANCELLED:
        return BillingWorkflowStatus.CANCELLED;
      default:
        return null;
    }
  }

  private isFinalizedInvoiceStatus(status?: InvoiceStatus | null) {
    return (
      status === InvoiceStatus.ISSUED ||
      status === InvoiceStatus.PAID ||
      status === InvoiceStatus.PARTIAL ||
      status === InvoiceStatus.OVERDUE
    );
  }

  private isPastBillingPeriod(year: number, month: number) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: BILLING_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const currentYear = Number(parts.find((part) => part.type === 'year')?.value || 0);
    const currentMonth = Number(parts.find((part) => part.type === 'month')?.value || 0);

    return year < currentYear || (year === currentYear && month < currentMonth);
  }

  private resolveInvoiceTargetStatus(
    record: BillingRecordWithRelations,
    options?: {
      manualAction?: boolean;
    },
  ) {
    const hasManualOverride =
      record.manualOverrideKwh !== null && record.manualOverrideKwh !== undefined;

    if (
      options?.manualAction &&
      hasManualOverride &&
      this.isPastBillingPeriod(record.year, record.month) &&
      Number(record.billableKwh || 0) > 0
    ) {
      return InvoiceStatus.ISSUED;
    }

    if (
      record.dataQualityStatus === BillingDataQualityStatus.OK &&
      record.dataSourceStable
    ) {
      return InvoiceStatus.ISSUED;
    }

    return InvoiceStatus.PENDING_REVIEW;
  }

  private async createOrUpdateInvoiceDraft(record: BillingRecordWithRelations, contract: any) {
    const draftBaseData = {
      customerId: record.customerId,
      contractId: contract.id,
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
      status: InvoiceStatus.DRAFT,
    };
    const draftItem = {
      description: this.buildInvoiceDescription(record),
      quantity: record.billableKwh,
      unitPrice: record.unitPrice,
      amount: record.subtotalAmount,
    };

    const invoice = record.invoiceId
      ? await this.prisma.invoice.update({
          where: { id: record.invoiceId },
          data: {
            ...draftBaseData,
            items: {
              deleteMany: {},
              create: [draftItem],
            },
          },
          include: {
            items: true,
            payments: true,
          },
        })
      : await this.prisma.invoice.create({
          data: {
            ...draftBaseData,
            invoiceNumber: generateCode(
              `INV-PV-${record.year}${String(record.month).padStart(2, '0')}`,
            ),
            items: {
              create: [draftItem],
            },
          },
          include: {
            items: true,
            payments: true,
          },
        });

    await this.prisma.monthlyPvBilling.update({
      where: { id: record.id },
      data: {
        contractId: contract.id,
        invoiceId: invoice.id,
        invoiceStatus: BillingWorkflowStatus.DRAFT,
      },
    });

    return invoice;
  }

  private async transitionInvoiceToTargetStatus(
    invoiceId: string,
    record: BillingRecordWithRelations,
    targetStatus: InvoiceStatus,
  ) {
    const previousInvoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!previousInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: targetStatus,
        issuedAt:
          targetStatus === InvoiceStatus.ISSUED && previousInvoice.status !== InvoiceStatus.ISSUED
            ? new Date()
            : previousInvoice.issuedAt,
      },
      include: {
        items: true,
        payments: true,
      },
    });

    await this.prisma.monthlyPvBilling.update({
      where: { id: record.id },
      data: {
        invoiceStatus: this.mapInvoiceToWorkflowStatus(updatedInvoice.status) || record.invoiceStatus,
        finalizedAt:
          updatedInvoice.status === InvoiceStatus.ISSUED
            ? record.finalizedAt || new Date()
            : null,
      },
    });

    if (
      updatedInvoice.status === InvoiceStatus.ISSUED &&
      previousInvoice.status !== InvoiceStatus.ISSUED
    ) {
      await this.notificationsService.create({
        userId: record.customer.userId,
        title: 'Hoa don ky moi da san sang',
        body: `Hoa don ${updatedInvoice.invoiceNumber} cho ky ${String(record.month).padStart(2, '0')}/${record.year} da duoc phat hanh.`,
        entityType: 'Invoice',
        entityId: updatedInvoice.id,
        linkHref: '/customer/billing',
      });
    }

    return updatedInvoice;
  }

  private async buildCurrentMonthEstimate(customerId: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: BILLING_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
    const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
    const existing = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        customerId,
        month,
        year,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (existing) {
      return null;
    }

    const contract = await this.prisma.contract.findFirst({
      where: {
        customerId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        servicePackage: true,
        solarSystem: {
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }],
    });

    if (!contract?.solarSystem) {
      return null;
    }

    let amounts: AmountBreakdown;
    try {
      amounts = await this.calculateAmounts(
        contract.solarSystemId,
        {
          month,
          year,
        },
        null,
        contract,
      );
    } catch {
      return null;
    }

    return {
      id: `estimate-${contract.solarSystemId}-${year}-${month}`,
      solarSystemId: contract.solarSystemId,
      solarSystem: contract.solarSystem,
      customerId,
      customer: contract.solarSystem.customer,
      contractId: contract.id,
      contract,
      invoiceId: null,
      invoice: null,
      month,
      year,
      pvGenerationKwh: amounts.pvGenerationKwh,
      billableKwh: amounts.billableKwh,
      unitPrice: amounts.unitPrice,
      subtotalAmount: amounts.subtotalAmount,
      vatRate: amounts.vatRate,
      taxAmount: amounts.taxAmount,
      discountAmount: amounts.discountAmount,
      totalAmount: amounts.totalAmount,
      syncStatus: BillingSyncStatus.SYNCED,
      dataQualityStatus: BillingDataQualityStatus.IN_PROGRESS,
      invoiceStatus: BillingWorkflowStatus.ESTIMATE,
      expectedDayCount: 0,
      availableDayCount: 0,
      missingDayCount: 0,
      dataSourceStable: this.isStableAutoBillingProvider(
        contract.solarSystem.sourceSystem || contract.solarSystem.monitoringProvider || '',
      ),
      autoSendEligible: false,
      qualitySummary:
        'San luong thang nay dang duoc cap nhat, he thong chi hien thi tam tinh cho den khi ket thuc thang.',
      manualOverrideKwh: null,
      manualOverrideReason: null,
      manualOverrideAt: null,
      manualOverrideByUserId: null,
      manualOverrideByUser: null,
      lastAutoRetriedAt: null,
      lastQualityCheckedAt: new Date(),
      finalizedAt: null,
      syncTime: new Date(),
      source: 'ENERGY_RECORD_AGGREGATE',
      note: 'Tam tinh trong thang tu daily energy data.',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as BillingRecordWithRelations;
  }

  private async syncLinkedInvoice(record: BillingRecordWithRelations) {
    if (!record.invoiceId || !record.invoice) {
      return;
    }

    this.ensureRecordIsMutable(record.invoice);
    const invoiceStatus =
      record.invoice.status === InvoiceStatus.PAID ||
      record.invoice.status === InvoiceStatus.PARTIAL
        ? record.invoice.status
        : record.invoiceStatus === BillingWorkflowStatus.PENDING_REVIEW
          ? InvoiceStatus.PENDING_REVIEW
          : record.invoiceStatus === BillingWorkflowStatus.DRAFT
            ? InvoiceStatus.DRAFT
            : record.invoice.status;

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
        status: invoiceStatus,
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
      expectedDayCount: Number(record.expectedDayCount || 0),
      availableDayCount: Number(record.availableDayCount || 0),
      missingDayCount: Number(record.missingDayCount || 0),
      manualOverrideKwh: this.optionalNumber(record.manualOverrideKwh),
      manualOverrideByUser: record.manualOverrideByUser
        ? {
            id: record.manualOverrideByUser.id,
            fullName: record.manualOverrideByUser.fullName,
            email: record.manualOverrideByUser.email,
          }
        : null,
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
        locationAddress: record.solarSystem.locationAddress,
        stationId: record.solarSystem.stationId,
        stationName: record.solarSystem.stationName,
        sourceSystem: record.solarSystem.sourceSystem,
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
