import { Injectable } from '@nestjs/common';
import {
  buildOperationalFreshness,
  buildOperationalSourceLabel,
  classifyOperationalSource,
  DEFAULT_OPERATIONAL_STALE_DAYS,
} from '../common/config/operational-data-source';
import {
  aggregateOperationalPeriodMetrics,
  buildCumulativePvReadingLookups,
  buildOperationalPeriodKey,
} from '../common/helpers/operational-period.helper';
import { CustomerPortalAggregateService } from './customer-portal-aggregate.service';
import { PrismaService } from '../prisma/prisma.service';
import { sumBy } from '../common/helpers/domain.helper';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerPortalAggregateService: CustomerPortalAggregateService,
  ) {}

  async adminDashboard() {
    const [customers, systems, invoices, tickets, payments, energyRecords] = await Promise.all([
      this.prisma.customer.findMany({ where: { deletedAt: null } }),
      this.prisma.solarSystem.findMany({
        where: { deletedAt: null },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          monthlyEnergyRecords: {
            where: { deletedAt: null },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
            take: 1,
            include: {
              updatedByUser: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.invoice.findMany({
        where: { deletedAt: null },
        include: {
          customer: true,
        },
      }),
      this.prisma.supportTicket.findMany({
        where: { deletedAt: null },
        include: {
          customer: true,
        },
      }),
      this.prisma.payment.findMany({ where: { status: 'SUCCESS' } }),
      this.prisma.energyRecord.findMany({
        orderBy: { recordDate: 'asc' },
      }),
    ]);

    const totalCapacityKwp = sumBy(systems, (system) => Number(system.capacityKwp || 0));
    const now = new Date();
    const monthlyRevenue = sumBy(
      payments.filter(
        (payment) =>
          payment.createdAt.getUTCFullYear() === now.getUTCFullYear() &&
          payment.createdAt.getUTCMonth() === now.getUTCMonth(),
      ),
      (payment) => Number(payment.amount || 0),
    );
    const yearlyRevenue = sumBy(
      payments.filter((payment) => payment.createdAt.getUTCFullYear() === now.getUTCFullYear()),
      (payment) => Number(payment.amount || 0),
    );
    const unpaidInvoices = invoices.filter((invoice) => invoice.status !== 'PAID').length;
    const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE').length;
    const onTimeRate = invoices.length
      ? (invoices.filter((invoice) => invoice.status === 'PAID').length / invoices.length) * 100
      : 100;

    const topCustomers = customers
      .map((customer) => {
        const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);

        return {
          customerId: customer.id,
          companyName: customer.companyName,
          totalBilled: sumBy(customerInvoices, (invoice) => Number(invoice.totalAmount || 0)),
          unpaidBalance: sumBy(
            customerInvoices.filter((invoice) => invoice.status !== 'PAID'),
            (invoice) => Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0),
          ),
        };
      })
      .sort((left, right) => right.totalBilled - left.totalBilled)
      .slice(0, 5);

    const operationalRows = systems.map((system) => {
      const latestRecord = system.monthlyEnergyRecords?.[0] || null;
      const freshness = buildOperationalFreshness({
        year: latestRecord?.year,
        month: latestRecord?.month,
        syncTime: latestRecord?.syncTime,
        staleDays: DEFAULT_OPERATIONAL_STALE_DAYS,
      });

      return {
        systemId: system.id,
        systemName: system.name,
        systemCode: system.systemCode,
        customerName:
          system.customer?.companyName || system.customer?.user?.fullName || 'Chưa gán khách hàng',
        latestPeriod:
          latestRecord && latestRecord.year && latestRecord.month
            ? `${String(latestRecord.month).padStart(2, '0')}/${latestRecord.year}`
            : null,
        latestSource: latestRecord?.source || null,
        latestSourceLabel: buildOperationalSourceLabel(latestRecord?.source),
        latestSourceKind: classifyOperationalSource(latestRecord?.source),
        latestUpdatedAt: latestRecord?.syncTime?.toISOString?.() || null,
        latestUpdatedBy: latestRecord?.updatedByUser?.fullName || null,
        latestPvGenerationKwh:
          latestRecord?.pvGenerationKwh !== null && latestRecord?.pvGenerationKwh !== undefined
            ? Number(latestRecord.pvGenerationKwh)
            : null,
        freshness,
      };
    });

    const revenueTrendMap = new Map<string, number>();
    for (const payment of payments) {
      const label = `${payment.createdAt.getUTCFullYear()}-${String(
        payment.createdAt.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      revenueTrendMap.set(label, (revenueTrendMap.get(label) || 0) + Number(payment.amount || 0));
    }

    const energyTrendMap = new Map<string, { solar: number; load: number }>();
    for (const record of energyRecords) {
      const label = record.recordDate.toISOString().slice(0, 10);
      const current = energyTrendMap.get(label) || { solar: 0, load: 0 };
      current.solar += Number(record.solarGeneratedKwh || 0);
      current.load += Number(record.loadConsumedKwh || 0);
      energyTrendMap.set(label, current);
    }

    return {
      summary: {
        totalCustomers: customers.length,
        totalCapacityKwp,
        monthlyRevenue,
        yearlyRevenue,
        unpaidInvoices,
        overdueInvoices,
        openTickets: tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status))
          .length,
        onTimeRate: Number(onTimeRate.toFixed(2)),
        operationalReadySystems: operationalRows.filter((row) => row.freshness.code === 'READY')
          .length,
        operationalStaleSystems: operationalRows.filter((row) => row.freshness.code === 'STALE')
          .length,
        operationalMissingSystems: operationalRows.filter((row) => row.freshness.code === 'MISSING')
          .length,
      },
      revenueTrend: Array.from(revenueTrendMap.entries()).map(([name, revenue]) => ({
        name,
        revenue,
      })),
      energyTrend: Array.from(energyTrendMap.entries())
        .slice(-14)
        .map(([name, values]) => ({
          name,
          solar: Number(values.solar.toFixed(2)),
          load: Number(values.load.toFixed(2)),
        })),
      topCustomers,
      operationalOverview: operationalRows
        .sort((left, right) => {
          const score = { STALE: 0, MISSING: 1, READY: 2 } as Record<string, number>;
          return (
            score[left.freshness.code] - score[right.freshness.code] ||
            (left.latestUpdatedAt || '').localeCompare(right.latestUpdatedAt || '')
          );
        })
        .slice(0, 8),
      ticketSummary: {
        open: tickets.filter((ticket) => ticket.status === 'OPEN').length,
        inProgress: tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length,
        resolved: tickets.filter((ticket) => ['RESOLVED', 'CLOSED'].includes(ticket.status)).length,
      },
    };
  }

  async customerDashboard(customerId: string) {
    const systems = await this.prisma.solarSystem.findMany({
      where: { customerId, deletedAt: null },
      include: {
        devices: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'desc' }],
        },
        deyeTelemetryRecords: {
          where: { deletedAt: null },
          orderBy: [{ recordedAt: 'desc' }],
          take: 72,
        },
        deyeDailyRecords: {
          where: { deletedAt: null },
          orderBy: [{ recordDate: 'desc' }],
          take: 45,
        },
        energyRecords: {
          orderBy: { recordDate: 'asc' },
          take: 60,
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            updatedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        monthlyPvBillings: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            invoice: true,
          },
        },
        contracts: {
          where: { deletedAt: null },
          include: {
            servicePackage: true,
          },
        },
      },
    });

    const [customerContracts, invoices] = await Promise.all([
      this.prisma.contract.findMany({
        where: {
          deletedAt: null,
          OR: [
            { customerId },
            {
              solarSystem: {
                customerId,
                deletedAt: null,
              },
            },
          ],
        },
        include: {
          servicePackage: true,
          solarSystem: true,
        },
        orderBy: [{ startDate: 'desc' }],
      }),
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { customerId },
            {
              contract: {
                customerId,
                deletedAt: null,
              },
            },
            {
              contract: {
                solarSystem: {
                  customerId,
                  deletedAt: null,
                },
              },
            },
          ],
        },
        include: {
          payments: true,
          contract: {
            include: {
              solarSystem: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
        orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      }),
    ]);

    const tickets = await this.prisma.supportTicket.findMany({
      where: { customerId, deletedAt: null },
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });

    const aggregate = this.customerPortalAggregateService.build({
      systems,
      invoices,
    });

    const records = systems.flatMap((system) => system.energyRecords);
    const dailyRecords = systems.flatMap((system) => system.deyeDailyRecords);
    const telemetryRecords = systems.flatMap((system) => system.deyeTelemetryRecords);
    const monthlyEnergyRecords = systems
      .flatMap((system) => system.monthlyEnergyRecords)
      .sort((left, right) => right.year - left.year || right.month - left.month);
    const monthlyPvBillings = systems
      .flatMap((system) => system.monthlyPvBillings)
      .sort((left, right) => right.year - left.year || right.month - left.month);

    const recentRecords = records.slice(-30);
    const recentDailyRecords = [...dailyRecords]
      .sort((left, right) => left.recordDate.getTime() - right.recordDate.getTime())
      .slice(-30);
    const recentTelemetryRecords = [...telemetryRecords]
      .sort((left, right) => left.recordedAt.getTime() - right.recordedAt.getTime())
      .slice(-96);
    const recentMonthlyRecords = [...monthlyEnergyRecords]
      .sort((left, right) => left.year - right.year || left.month - right.month)
      .slice(-12);
    const latestOperationalRecord = monthlyEnergyRecords[0] || null;
    const latestDailyRecord = dailyRecords[0] || null;
    const monthlyRecordLookup = new Map<string, any[]>();
    const customerMonthlyRecordLookup = new Map<string, any[]>();
    const monthlyBillingLookup = new Map<string, any[]>();
    const customerMonthlyBillingLookup = new Map<string, any[]>();
    const cumulativeLookups = buildCumulativePvReadingLookups(
      monthlyPvBillings.map((record) => ({
        id: record.id,
        solarSystemId: record.solarSystemId,
        contractId: record.contractId,
        year: record.year,
        month: record.month,
        pvGenerationKwh: record.pvGenerationKwh,
      })),
    );
    const billingHistoryMap = new Map(
      monthlyPvBillings
        .map((record) => [
          buildOperationalPeriodKey(record.solarSystemId, record.year, record.month),
          record,
        ] as const)
        .filter((entry): entry is [string, (typeof monthlyPvBillings)[number]] => Boolean(entry[0])),
    );

    for (const record of monthlyEnergyRecords) {
      const systemKey = buildOperationalPeriodKey(
        record.solarSystemId,
        record.year,
        record.month,
      );
      if (systemKey) {
        const existing = monthlyRecordLookup.get(systemKey) || [];
        existing.push(record);
        monthlyRecordLookup.set(systemKey, existing);
      }

      if (record.customerId) {
        const customerKey = `${record.customerId}:${record.year}:${record.month}`;
        const existing = customerMonthlyRecordLookup.get(customerKey) || [];
        existing.push(record);
        customerMonthlyRecordLookup.set(customerKey, existing);
      }
    }

    for (const billing of monthlyPvBillings) {
      const systemKey = buildOperationalPeriodKey(
        billing.solarSystemId,
        billing.year,
        billing.month,
      );
      if (systemKey) {
        const existing = monthlyBillingLookup.get(systemKey) || [];
        existing.push(billing);
        monthlyBillingLookup.set(systemKey, existing);
      }

      if (billing.customerId) {
        const customerKey = `${billing.customerId}:${billing.year}:${billing.month}`;
        const existing = customerMonthlyBillingLookup.get(customerKey) || [];
        existing.push(billing);
        customerMonthlyBillingLookup.set(customerKey, existing);
      }
    }

    const hasDailyEnergy = recentDailyRecords.some(
      (record) => this.decimalToNullableNumber(record.generationValueKwh) !== null,
    );
    const hasRealtimeTelemetry = recentTelemetryRecords.some(
      (record) =>
        this.decimalToNullableNumber(record.generationPowerKw) !== null ||
        this.decimalToNullableNumber(record.batterySocPct) !== null,
    );

    const liveSnapshots = systems
      .map((system) => this.buildLiveSnapshot(system))
      .filter((snapshot) => snapshot !== null);

    const solarGenerated =
      latestOperationalRecord?.pvGenerationKwh !== null &&
      latestOperationalRecord?.pvGenerationKwh !== undefined
        ? this.roundMetric(Number(latestOperationalRecord.pvGenerationKwh || 0))
        : this.decimalToNullableNumber(latestDailyRecord?.generationValueKwh);

    const loadConsumed =
      latestOperationalRecord?.loadConsumedKwh !== null &&
      latestOperationalRecord?.loadConsumedKwh !== undefined
        ? this.roundMetric(Number(latestOperationalRecord.loadConsumedKwh || 0))
        : this.decimalToNullableNumber(latestDailyRecord?.consumptionValueKwh);

    const gridImported = recentDailyRecords.some(
      (record) => this.decimalToNullableNumber(record.purchaseValueKwh) !== null,
    )
      ? this.roundMetric(
          sumBy(
            recentDailyRecords,
            (record) => this.decimalToNullableNumber(record.purchaseValueKwh) || 0,
          ),
        )
      : null;

    const gridExported = recentDailyRecords.some(
      (record) => this.decimalToNullableNumber(record.gridValueKwh) !== null,
    )
      ? this.roundMetric(
          sumBy(
            recentDailyRecords,
            (record) => this.decimalToNullableNumber(record.gridValueKwh) || 0,
          ),
        )
      : null;

    const savings = recentRecords.length
      ? sumBy(recentRecords, (record) => Number(record.savingAmount || 0))
      : recentMonthlyRecords.some((record) => record.savingsAmount !== null)
        ? sumBy(recentMonthlyRecords, (record) => Number(record.savingsAmount || 0))
        : sumBy(monthlyPvBillings.slice(0, 12), (record) => Number(record.subtotalAmount || 0));

    const openInvoices = invoices.filter(
      (invoice) => !['PAID', 'CANCELLED'].includes(invoice.status),
    );
    const outstanding = sumBy(
      openInvoices,
      (invoice) => Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0),
    );
    const nearestDueInvoice =
      [...openInvoices].sort(
        (left, right) => left.dueDate.getTime() - right.dueDate.getTime(),
      )[0] || null;

    const realtimePowers = liveSnapshots
      .map((snapshot) => snapshot.currentPvKw)
      .filter((value) => value !== null && value !== undefined) as number[];
    const batterySocs = liveSnapshots
      .map((snapshot) => snapshot.batterySocPct)
      .filter((value) => value !== null && value !== undefined) as number[];

    const currentPvKw = realtimePowers.length
      ? this.roundMetric(sumBy(realtimePowers, (value) => value))
      : null;
    const averageBatterySoc = batterySocs.length
      ? this.roundMetric(sumBy(batterySocs, (value) => value) / batterySocs.length)
      : null;

    const trendScope = hasRealtimeTelemetry
      ? 'HOURLY'
      : hasDailyEnergy
        ? 'DAILY'
        : recentMonthlyRecords.length
          ? 'MONTHLY'
          : 'EMPTY';

    const latestInvoice = invoices[0] || null;
    const latestBilling = monthlyPvBillings[0] || null;
    const latestEstimatedBilling =
      latestBilling && !latestBilling.invoiceId ? latestBilling : null;
    const currentBillingAmount = this.roundCurrency(
      openInvoices.length
        ? outstanding
        : latestEstimatedBilling
          ? Number(latestEstimatedBilling.totalAmount || 0)
          : 0,
    );
    const currentBillingLabel = openInvoices.length
      ? 'Cần thanh toán'
      : latestEstimatedBilling
        ? 'Tạm tính kỳ này'
        : latestInvoice
          ? 'Đã đối soát kỳ gần nhất'
          : null;
    const currentBillingPeriod = nearestDueInvoice
      ? `${String(nearestDueInvoice.billingMonth).padStart(2, '0')}/${nearestDueInvoice.billingYear}`
      : latestEstimatedBilling
        ? `${String(latestEstimatedBilling.month).padStart(2, '0')}/${latestEstimatedBilling.year}`
        : latestInvoice
          ? `${String(latestInvoice.billingMonth).padStart(2, '0')}/${latestInvoice.billingYear}`
          : null;
    const currentBillingStatus = openInvoices.length
      ? openInvoices.some((invoice) => invoice.status === 'OVERDUE')
        ? 'OVERDUE'
        : openInvoices.some((invoice) => invoice.status === 'PARTIAL')
          ? 'PARTIAL'
          : nearestDueInvoice?.status || 'ISSUED'
      : latestEstimatedBilling
        ? 'ESTIMATED'
        : latestInvoice
          ? latestInvoice.status
          : null;
    const currentBillingVatRate = nearestDueInvoice
      ? Number(nearestDueInvoice.vatRate || 0)
      : latestEstimatedBilling
        ? Number(latestEstimatedBilling.vatRate || 0)
        : latestInvoice
          ? Number(latestInvoice.vatRate || 0)
          : null;

    return {
      summary: {
        solarGenerated: aggregate.summary.totalGenerationLifetime,
        loadConsumed: aggregate.summary.totalConsumptionCurrentMonth,
        gridImported,
        gridExported,
        savings,
        outstanding: this.roundCurrency(aggregate.summary.totalUnpaidAmount),
        invoiceCount: invoices.length,
        paymentStatus: latestInvoice?.status || 'ISSUED',
        liveSystems: 0,
        currentPvKw: null,
        averageBatterySoc: null,
        hasRealtimeData: hasRealtimeTelemetry,
        hasDailyData: aggregate.consumptionInsight.hasDailyData,
        hasMonthlyData:
          aggregate.consumptionInsight.hasMonthlyData || recentMonthlyRecords.length > 0,
        currentBillingAmount,
        currentBillingLabel:
          aggregate.summary.totalUnpaidAmount > 0
            ? 'Cần thanh toán'
            : latestEstimatedBilling
              ? 'Tạm tính kỳ này'
              : currentBillingLabel,
        currentBillingPeriod:
          aggregate.summary.latestDataPeriod || currentBillingPeriod,
        currentBillingStatus:
          aggregate.summary.totalUnpaidAmount > 0 ? 'OPEN' : currentBillingStatus,
        currentBillingVatRate,
        outstandingInvoiceCount: aggregate.summary.outstandingInvoiceCount,
        nearestDueInvoiceNumber: aggregate.summary.nearestDueInvoiceNumber,
        nearestDueInvoiceDate: aggregate.summary.nearestDueInvoiceDate,
        latestDataPeriod: aggregate.summary.latestDataPeriod,
        latestDataSourceLabel: aggregate.summary.latestDataSourceLabel,
        latestDataStatusLabel: aggregate.summary.latestDataStatusLabel,
        latestMeterReading: aggregate.summary.latestMeterReading,
        latestUpdatedAt: aggregate.summary.latestUpdatedAt,
        systemsTracked: aggregate.summary.systemsTracked,
        systemsUpdatedCurrentMonth: aggregate.summary.systemsUpdatedCurrentMonth,
      },
      generationTrend: aggregate.monthlyTrend,
      generationTrendScope: 'MONTHLY',
      generationTrendUnit: 'kWh',
      generationTrendDescription:
        'Sản lượng được tổng hợp theo kỳ cập nhật của tất cả hệ thống. Portal hiện chỉ hiển thị dữ liệu đã đối soát, không giả lập realtime.',
      consumptionInsight: aggregate.consumptionInsight,
      systems: systems.map((system) => ({
        id: system.id,
        name: system.name,
        systemCode: system.systemCode,
        capacityKwp: Number(system.capacityKwp),
        panelCount: system.panelCount,
        inverterBrand: system.inverterBrand,
        inverterModel: system.inverterModel,
        monitoringProvider: system.monitoringProvider,
        monitoringPlantId: system.monitoringPlantId,
        stationId: system.stationId,
        stationName: system.stationName,
        timeZone: system.timeZone,
        latestMonitorSnapshot: system.latestMonitorSnapshot,
        latestMonitorAt: system.latestMonitorAt?.toISOString() || null,
        lastStationSyncAt: system.lastStationSyncAt?.toISOString() || null,
        lastRealtimeSyncAt: system.lastRealtimeSyncAt?.toISOString() || null,
        lastDailySyncAt: system.lastDailySyncAt?.toISOString() || null,
        lastHourlySyncAt: system.lastHourlySyncAt?.toISOString() || null,
        lastMonthlySyncAt: system.lastMonthlySyncAt?.toISOString() || null,
        lastBillingSyncAt: system.lastBillingSyncAt?.toISOString() || null,
        location: system.location,
        status: system.status,
        hasRealtimeData:
          system.deyeTelemetryRecords.some(
            (record) => this.decimalToNullableNumber(record.generationPowerKw) !== null,
          ) ||
          system.deyeTelemetryRecords.some(
            (record) => this.decimalToNullableNumber(record.batterySocPct) !== null,
          ),
        hasDailyData: system.deyeDailyRecords.length > 0,
        hasMonthlyData: system.monthlyEnergyRecords.length > 0,
        hasBillingData: system.monthlyPvBillings.length > 0,
        telemetryRecords: system.deyeTelemetryRecords.slice(0, 24).map((record) => ({
          id: record.id,
          recordedAt: record.recordedAt.toISOString(),
          generationPowerKw: this.decimalToNullableNumber(record.generationPowerKw),
          consumptionPowerKw: this.decimalToNullableNumber(record.consumptionPowerKw),
          gridPowerKw: this.decimalToNullableNumber(record.gridPowerKw),
          batterySocPct: this.decimalToNullableNumber(record.batterySocPct),
          generationValueKwh: this.decimalToNullableNumber(record.generationValueKwh),
          consumptionValueKwh: this.decimalToNullableNumber(record.consumptionValueKwh),
        })),
        dailyRecords: system.deyeDailyRecords.slice(0, 35).map((record) => ({
          id: record.id,
          recordDate: record.recordDate.toISOString(),
          generationValueKwh: this.decimalToNullableNumber(record.generationValueKwh),
          consumptionValueKwh: this.decimalToNullableNumber(record.consumptionValueKwh),
          purchaseValueKwh: this.decimalToNullableNumber(record.purchaseValueKwh),
          gridValueKwh: this.decimalToNullableNumber(record.gridValueKwh),
          batterySocPct: this.decimalToNullableNumber(record.batterySocPct),
          fullPowerHours: this.decimalToNullableNumber(record.fullPowerHours),
        })),
        devices: system.devices.map((device) => ({
          id: device.id,
          systemId: device.systemId,
          connectionId: device.connectionId,
          stationId: device.stationId,
          deviceId: device.deviceId,
          deviceSn: device.deviceSn,
          deviceType: device.deviceType,
          productId: device.productId,
          connectStatus: device.connectStatus,
          collectionTime:
            device.collectionTime !== null && device.collectionTime !== undefined
              ? Number(device.collectionTime)
              : null,
          externalPayload:
            device.externalPayload &&
            typeof device.externalPayload === 'object' &&
            !Array.isArray(device.externalPayload)
              ? device.externalPayload
              : null,
          createdAt: device.createdAt.toISOString(),
          updatedAt: device.updatedAt.toISOString(),
        })),
        monthlyEnergyRecords: system.monthlyEnergyRecords.map((record) => ({
          id: record.id,
          solarSystemId: record.solarSystemId,
          customerId: record.customerId,
          deyeConnectionId: record.deyeConnectionId,
          connectionId: record.connectionId,
          stationId: record.stationId,
          year: record.year,
          month: record.month,
          pvGenerationKwh: Number(record.pvGenerationKwh),
          loadConsumedKwh:
            record.loadConsumedKwh !== null && record.loadConsumedKwh !== undefined
              ? Number(record.loadConsumedKwh)
              : null,
          savingsAmount:
            record.savingsAmount !== null && record.savingsAmount !== undefined
              ? Number(record.savingsAmount)
              : null,
          unitPrice: Number(record.unitPrice),
          vatRate: Number(record.vatRate || 0),
          subtotalAmount: Number(record.subtotalAmount),
          taxAmount: Number(record.taxAmount),
          discountAmount: Number(record.discountAmount),
          totalAmount: Number(record.totalAmount),
          systemStatusSnapshot: record.systemStatusSnapshot || null,
          source: record.source,
          sourceLabel: buildOperationalSourceLabel(record.source),
          sourceKind: classifyOperationalSource(record.source),
          syncTime: record.syncTime.toISOString(),
          note: record.note,
          dataFreshness: buildOperationalFreshness({
            year: record.year,
            month: record.month,
            syncTime: record.syncTime,
          }),
          updatedByUser: record.updatedByUser
            ? {
                id: record.updatedByUser.id,
                fullName: record.updatedByUser.fullName,
                email: record.updatedByUser.email,
              }
            : null,
          rawPayload:
            record.rawPayload &&
            typeof record.rawPayload === 'object' &&
            !Array.isArray(record.rawPayload)
              ? record.rawPayload
              : null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        })),
        monthlyPvBillings: system.monthlyPvBillings.map((record) => ({
          id: record.id,
          solarSystemId: record.solarSystemId,
          customerId: record.customerId,
          contractId: record.contractId,
          invoiceId: record.invoiceId,
          month: record.month,
          year: record.year,
          pvGenerationKwh: Number(record.pvGenerationKwh),
          billableKwh: Number(record.billableKwh),
          unitPrice: Number(record.unitPrice),
          vatRate: Number(record.vatRate || 0),
          subtotalAmount: Number(record.subtotalAmount),
          taxAmount: Number(record.taxAmount),
          discountAmount: Number(record.discountAmount),
          totalAmount: Number(record.totalAmount),
          syncTime: record.syncTime.toISOString(),
          source: record.source,
          note: record.note,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        })),
        latestMonthlyGenerationKwh: system.monthlyEnergyRecords[0]
          ? Number(system.monthlyEnergyRecords[0].pvGenerationKwh)
          : null,
        latestMonthlyBillingAmount: system.monthlyPvBillings[0]
          ? Number(system.monthlyPvBillings[0].totalAmount)
          : null,
        latestMonthlyBillingMonth: system.monthlyPvBillings[0]?.month || null,
        latestMonthlyBillingYear: system.monthlyPvBillings[0]?.year || null,
        latestMonthlySyncTime: system.monthlyEnergyRecords[0]
          ? system.monthlyEnergyRecords[0].syncTime.toISOString()
          : null,
        latestOperationalData: system.monthlyEnergyRecords[0]
          ? {
              period: `${String(system.monthlyEnergyRecords[0].month).padStart(2, '0')}/${system.monthlyEnergyRecords[0].year}`,
              source: system.monthlyEnergyRecords[0].source,
              sourceLabel: buildOperationalSourceLabel(system.monthlyEnergyRecords[0].source),
              sourceKind: classifyOperationalSource(system.monthlyEnergyRecords[0].source),
              lastUpdatedAt: system.monthlyEnergyRecords[0].syncTime.toISOString(),
              lastUpdatedBy: system.monthlyEnergyRecords[0].updatedByUser
                ? {
                    id: system.monthlyEnergyRecords[0].updatedByUser.id,
                    fullName: system.monthlyEnergyRecords[0].updatedByUser.fullName,
                    email: system.monthlyEnergyRecords[0].updatedByUser.email,
                  }
                : null,
              freshness: buildOperationalFreshness({
                year: system.monthlyEnergyRecords[0].year,
                month: system.monthlyEnergyRecords[0].month,
                syncTime: system.monthlyEnergyRecords[0].syncTime,
              }),
            }
          : null,
      })),
      liveSnapshots: [],
      meterHistory: aggregate.meterHistory,
      syncStatus: aggregate.syncStatus,
      contracts: customerContracts.map((contract) => ({
          id: contract.id,
          contractNumber: contract.contractNumber,
          type: contract.type,
          status: contract.status,
          packageName: contract.servicePackage.name,
          pricePerKwh: Number(contract.pricePerKwh || 0),
          fixedMonthlyFee: Number(contract.fixedMonthlyFee || 0),
        })),
      invoices: invoices.slice(0, 6).map((invoice) => {
        const systemKey =
          buildOperationalPeriodKey(
            invoice.contract?.solarSystemId || invoice.contract?.solarSystem?.id,
            invoice.billingYear,
            invoice.billingMonth,
          ) || '';
        const customerKey =
          invoice.customerId && invoice.billingYear && invoice.billingMonth
            ? `${invoice.customerId}:${invoice.billingYear}:${invoice.billingMonth}`
            : '';
        const operationalRecords = (monthlyRecordLookup.get(systemKey) || []).length
          ? monthlyRecordLookup.get(systemKey) || []
          : customerMonthlyRecordLookup.get(customerKey) || [];
        const billingRecords = (monthlyBillingLookup.get(systemKey) || []).length
          ? monthlyBillingLookup.get(systemKey) || []
          : customerMonthlyBillingLookup.get(customerKey) || [];
        const basePeriodMetrics = aggregateOperationalPeriodMetrics(
          operationalRecords.length ? operationalRecords : billingRecords,
          {
            year: invoice.billingYear,
            month: invoice.billingMonth,
          },
        );
        const cumulativeReading =
          (systemKey ? cumulativeLookups.bySystemPeriod.get(systemKey) : null) || null;
        const billingHistoryRecord =
          (systemKey ? billingHistoryMap.get(systemKey) : null) || null;
        const periodMetrics = basePeriodMetrics
          ? {
              ...basePeriodMetrics,
              pvGenerationKwh:
                billingHistoryRecord?.pvGenerationKwh !== null &&
                billingHistoryRecord?.pvGenerationKwh !== undefined
                  ? Number(billingHistoryRecord.pvGenerationKwh)
                  : basePeriodMetrics.pvGenerationKwh,
              previousReading:
                cumulativeReading?.previousReading ??
                basePeriodMetrics.previousReading ??
                null,
              currentReading:
                cumulativeReading?.currentReading ??
                basePeriodMetrics.currentReading ??
                null,
            }
          : null;

        return {
          ...invoice,
          subtotal: Number(invoice.subtotal || 0),
          vatRate: Number(invoice.vatRate || 0),
          vatAmount: Number(invoice.vatAmount || 0),
          penaltyAmount: Number(invoice.penaltyAmount || 0),
          discountAmount: Number(invoice.discountAmount || 0),
          totalAmount: Number(invoice.totalAmount || 0),
          paidAmount: Number(invoice.paidAmount || 0),
          periodMetrics,
        };
      }),
      tickets: tickets.slice(0, 6),
    };
  }

  private buildLiveSnapshot(system: any) {
    const snapshot =
      system.latestMonitorSnapshot &&
      typeof system.latestMonitorSnapshot === 'object' &&
      !Array.isArray(system.latestMonitorSnapshot)
        ? system.latestMonitorSnapshot
        : {};
    const latestTelemetry = system.deyeTelemetryRecords?.[0] || null;
    const latestDaily = system.deyeDailyRecords?.[0] || null;
    const primaryDevice =
      system.devices?.find((device: any) =>
        String(device.deviceType || '').toUpperCase().includes('INVERTER'),
      ) ||
      system.devices?.[0] ||
      null;
    const hasRealtimeData =
      latestTelemetry &&
      (this.decimalToNullableNumber(latestTelemetry.generationPowerKw) !== null ||
        this.decimalToNullableNumber(latestTelemetry.batterySocPct) !== null);

    if (!hasRealtimeData && !system.monitoringProvider && !system.stationId) {
      return null;
    }

    return {
      systemId: system.id,
      systemName: system.name,
      provider: this.toString(snapshot.provider) || system.monitoringProvider || null,
      plantId: this.toString(snapshot.plantId) || system.stationId || system.monitoringPlantId,
      plantName: this.toString(snapshot.plantName) || system.stationName || system.name,
      currentPvKw: this.decimalToNullableNumber(latestTelemetry?.generationPowerKw),
      batterySocPct: this.decimalToNullableNumber(latestTelemetry?.batterySocPct),
      todayGeneratedKwh: this.decimalToNullableNumber(latestDaily?.generationValueKwh),
      totalGeneratedKwh:
        this.decimalToNullableNumber(system.totalGenerationKwh) ||
        this.toNumber(snapshot.totalGeneratedKwh),
      todayLoadConsumedKwh: this.decimalToNullableNumber(latestDaily?.consumptionValueKwh),
      todayGridImportedKwh: this.decimalToNullableNumber(latestDaily?.purchaseValueKwh),
      todayGridExportedKwh: this.decimalToNullableNumber(latestDaily?.gridValueKwh),
      inverterStatus:
        this.toString(snapshot.connectionStatus) ||
        this.toString(snapshot.inverterStatus) ||
        (!hasRealtimeData && system.lastMonthlySyncAt ? 'DA_DONG_BO_SAN_LUONG_THANG' : null),
      inverterSerial: this.toString(snapshot.inverterSerial) || primaryDevice?.deviceSn || null,
      deviceId: this.toString(snapshot.deviceId) || primaryDevice?.deviceId || null,
      deviceModel:
        this.toString(snapshot.deviceModel) ||
        primaryDevice?.productId ||
        primaryDevice?.deviceType ||
        null,
      deviceType: this.toString(snapshot.deviceType) || primaryDevice?.deviceType || null,
      fetchedAt:
        latestTelemetry?.recordedAt?.toISOString() ||
        system.lastRealtimeSyncAt?.toISOString() ||
        system.lastMonthlySyncAt?.toISOString() ||
        null,
      lastRealtimeSyncAt: system.lastRealtimeSyncAt?.toISOString() || null,
      lastDailySyncAt: system.lastDailySyncAt?.toISOString() || null,
      dataScopes: {
        ...(snapshot.dataScopes && typeof snapshot.dataScopes === 'object'
          ? snapshot.dataScopes
          : {}),
        station: Boolean(system.stationId || system.monitoringPlantId),
        realtime: Boolean(latestTelemetry),
        hourly: Boolean(latestTelemetry),
        daily: Boolean(latestDaily),
        monthly: Boolean(system.lastMonthlySyncAt || system.monthlyEnergyRecords?.length),
      },
    };
  }

  private buildHourlyTrend(records: any[]) {
    const map = new Map<string, { solar: number; load: number; grid: number; count: number }>();

    for (const record of records) {
      const label = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        hour12: false,
      }).format(record.recordedAt);

      const current = map.get(label) || { solar: 0, load: 0, grid: 0, count: 0 };
      current.solar += this.decimalToNullableNumber(record.generationPowerKw) || 0;
      current.load += this.decimalToNullableNumber(record.consumptionPowerKw) || 0;
      current.grid += this.decimalToNullableNumber(record.gridPowerKw) || 0;
      current.count += 1;
      map.set(label, current);
    }

    return [...map.entries()].slice(-24).map(([name, values]) => ({
      name,
      solar: this.roundMetric(values.count ? values.solar / values.count : values.solar),
      load: this.roundMetric(values.count ? values.load / values.count : values.load),
      grid: this.roundMetric(values.count ? values.grid / values.count : values.grid),
    }));
  }

  private buildDailyTrend(records: any[]) {
    return records.slice(-14).map((record) => ({
      name: record.recordDate.toISOString().slice(5, 10),
      solar: this.decimalToNullableNumber(record.generationValueKwh) || 0,
      load: this.decimalToNullableNumber(record.consumptionValueKwh) || 0,
      grid: this.decimalToNullableNumber(record.purchaseValueKwh) || 0,
    }));
  }

  private buildMonthlyTrend(records: any[]) {
    return records.map((record) => ({
      name: `${String(record.month).padStart(2, '0')}/${String(record.year).slice(-2)}`,
      solar: Number(record.pvGenerationKwh || 0),
      load: Number(record.loadConsumedKwh || 0),
      grid: 0,
    }));
  }

  private roundMetric(value: number) {
    return Number((value || 0).toFixed(2));
  }

  private roundCurrency(value: number) {
    return Math.round(value || 0);
  }

  private decimalToNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
