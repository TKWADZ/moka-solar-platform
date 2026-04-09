import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BillingDataQualityStatus,
  BillingSyncStatus,
  BillingWorkflowStatus,
} from '@prisma/client';
import { DeyeHistorySyncService } from '../deye-connections/deye-history-sync.service';
import { EnergyRecordsService } from '../energy-records/energy-records.service';
import { LuxPowerConnectionsService } from '../luxpower-connections/luxpower-connections.service';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZaloNotificationsService } from '../zalo-notifications/zalo-notifications.service';

const BILLING_TIMEZONE = process.env.BILLING_TIMEZONE || 'Asia/Saigon';

@Injectable()
export class BillingLifecycleService {
  private readonly logger = new Logger(BillingLifecycleService.name);
  private retryRunning = false;
  private finalizeRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
    private readonly energyRecordsService: EnergyRecordsService,
    private readonly deyeHistorySyncService: DeyeHistorySyncService,
    private readonly luxPowerConnectionsService: LuxPowerConnectionsService,
    private readonly zaloNotificationsService: ZaloNotificationsService,
  ) {}

  @Cron('10 0 1 * *', { timeZone: BILLING_TIMEZONE })
  async runPreviousMonthRetryAndReconcile() {
    if (this.retryRunning) {
      return;
    }

    this.retryRunning = true;
    try {
      const period = this.getPreviousMonthPeriod();
      const systems = await this.listBillingSystems();

      for (const system of systems) {
        try {
          await this.retrySystemHistory(system, period.month, period.year);
          await this.monthlyPvBillingsService.refreshLifecycleForSystemPeriod(
            system.id,
            period.month,
            period.year,
            {
              markAutoRetried: true,
            },
          );
        } catch (error) {
          await this.markPeriodError(
            system.id,
            period.month,
            period.year,
            error instanceof Error ? error.message : 'Retry sync that bai.',
          );
        }
      }
    } finally {
      this.retryRunning = false;
    }
  }

  @Cron('15 0 2 * *', { timeZone: BILLING_TIMEZONE })
  async runFinalizePreviousMonthInvoices() {
    if (this.finalizeRunning) {
      return;
    }

    this.finalizeRunning = true;
    try {
      const period = this.getPreviousMonthPeriod();
      const systems = await this.listBillingSystems();

      for (const system of systems) {
        try {
          const record = await this.monthlyPvBillingsService.refreshLifecycleForSystemPeriod(
            system.id,
            period.month,
            period.year,
            {
              markAutoRetried: false,
            },
          );

          if (!record) {
            continue;
          }

          const result = await this.monthlyPvBillingsService.generateInvoice(record.id, undefined, {
            autoSend: false,
          });

          if (
            result.record.dataQualityStatus === BillingDataQualityStatus.OK &&
            result.record.autoSendEligible &&
            result.invoice.status === 'ISSUED'
          ) {
            await this.zaloNotificationsService.sendInvoiceNotification({
              invoiceId: result.invoice.id,
              templateType: 'INVOICE',
            });
          }
        } catch (error) {
          await this.markPeriodError(
            system.id,
            period.month,
            period.year,
            error instanceof Error ? error.message : 'Finalize invoice that bai.',
          );
        }
      }
    } finally {
      this.finalizeRunning = false;
    }
  }

  private async listBillingSystems() {
    return this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
        customerId: {
          not: null,
        },
        contracts: {
          some: {
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        stationId: true,
        monitoringPlantId: true,
        sourceSystem: true,
        monitoringProvider: true,
        deyeConnectionId: true,
        luxPowerConnection: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  private async retrySystemHistory(
    system: {
      id: string;
      stationId: string | null;
      monitoringPlantId: string | null;
      sourceSystem: string | null;
      monitoringProvider: string | null;
      deyeConnectionId: string | null;
      luxPowerConnection: { id: string } | null;
    },
    month: number,
    year: number,
  ) {
    const provider = this.resolveProvider(system);

    if (provider === 'SEMS_PORTAL') {
      const missingDates = await this.findMissingDates(system.id, month, year);
      for (const recordDate of missingDates) {
        await this.energyRecordsService.syncFromSems(system.id, {
          plantId: system.monitoringPlantId || system.stationId || undefined,
          recordDate: recordDate.toISOString(),
        });
      }
      return;
    }

    if (provider === 'SOLARMAN') {
      const missingDates = await this.findMissingDates(system.id, month, year);
      for (const recordDate of missingDates) {
        await this.energyRecordsService.syncFromSolarman(system.id, {
          stationId: system.monitoringPlantId || system.stationId || undefined,
          recordDate: recordDate.toISOString(),
        });
      }
      return;
    }

    if (provider === 'DEYE') {
      if (!system.deyeConnectionId || !system.stationId) {
        throw new Error('He thong chua cau hinh du ket noi Deye de retry history.');
      }

      await this.deyeHistorySyncService.syncMonthlyHistory(system.deyeConnectionId, {
        year,
        stationIds: [system.stationId],
      });
      return;
    }

    if (provider === 'LUXPOWER') {
      if (!system.luxPowerConnection?.id) {
        throw new Error('He thong chua cau hinh LuxPower connection de retry history.');
      }

      await this.luxPowerConnectionsService.syncNow(system.luxPowerConnection.id, {
        forceRelogin: false,
      });
      return;
    }

    throw new Error('Khong xac dinh duoc provider de retry billing history.');
  }

  private async findMissingDates(solarSystemId: string, month: number, year: number) {
    const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const expectedKeys = Array.from({ length: totalDays }, (_, index) =>
      new Date(Date.UTC(year, month - 1, index + 1, 0, 0, 0, 0)).toISOString().slice(0, 10),
    );
    const rows = await this.prisma.energyRecord.findMany({
      where: {
        solarSystemId,
        recordDate: {
          gte: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
          lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        },
      },
      select: {
        recordDate: true,
      },
    });
    const actualKeys = new Set(rows.map((item) => item.recordDate.toISOString().slice(0, 10)));

    return expectedKeys
      .filter((key) => !actualKeys.has(key))
      .map((key) => new Date(`${key}T00:00:00.000Z`));
  }

  private resolveProvider(system: {
    sourceSystem: string | null;
    monitoringProvider: string | null;
  }) {
    return system.sourceSystem || system.monitoringProvider || 'UNKNOWN';
  }

  private getPreviousMonthPeriod() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: BILLING_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const currentYear = Number(parts.find((part) => part.type === 'year')?.value || 0);
    const currentMonth = Number(parts.find((part) => part.type === 'month')?.value || 0);
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const year = currentMonth === 1 ? currentYear - 1 : currentYear;

    return {
      month: previousMonth,
      year,
    };
  }

  private async markPeriodError(
    systemId: string,
    month: number,
    year: number,
    message: string,
  ) {
    const record = await this.prisma.monthlyPvBilling.findUnique({
      where: {
        solarSystemId_month_year: {
          solarSystemId: systemId,
          month,
          year,
        },
      },
    });

    if (!record) {
      this.logger.warn(`[billing-lifecycle] ${systemId} ${month}/${year}: ${message}`);
      return;
    }

    await this.prisma.monthlyPvBilling.update({
      where: { id: record.id },
      data: {
        syncStatus: BillingSyncStatus.ERROR,
        dataQualityStatus: BillingDataQualityStatus.ERROR,
        invoiceStatus: BillingWorkflowStatus.PENDING_REVIEW,
        qualitySummary: message,
        lastQualityCheckedAt: new Date(),
      },
    });
  }
}
