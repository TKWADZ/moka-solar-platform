import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { EnergyRecordsService } from '../energy-records/energy-records.service';
import { DeyeHistorySyncService } from '../deye-connections/deye-history-sync.service';
import { DeyeTelemetrySyncService } from '../deye-connections/deye-telemetry-sync.service';
import { LuxPowerConnectionsService } from '../luxpower-connections/luxpower-connections.service';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';

type SyncScope = 'REALTIME' | 'HISTORY' | 'DAY_CLOSE';
type SyncTier = 'ACTIVE_VIEW' | 'ONLINE' | 'IDLE' | 'BACKOFF';
type ManagedProvider = 'SEMS_PORTAL' | 'SOLARMAN' | 'DEYE' | 'LUXPOWER';

const MONITOR_SYNC_TIMEZONE = process.env.MONITOR_SYNC_TIMEZONE || 'Asia/Saigon';
const MANAGED_PROVIDERS = new Set<ManagedProvider>([
  'SEMS_PORTAL',
  'SOLARMAN',
  'DEYE',
  'LUXPOWER',
]);

@Injectable()
export class MonitorSyncService {
  private readonly logger = new Logger(MonitorSyncService.name);
  private queueRunning = false;
  private cleanupRunning = false;
  private closingRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly energyRecordsService: EnergyRecordsService,
    private readonly deyeTelemetrySyncService: DeyeTelemetrySyncService,
    private readonly deyeHistorySyncService: DeyeHistorySyncService,
    private readonly luxPowerConnectionsService: LuxPowerConnectionsService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  @Interval(60_000)
  async processAutoSyncQueue() {
    if (!this.schedulerEnabled() || this.queueRunning) {
      return;
    }

    this.queueRunning = true;
    try {
      const now = new Date();
      await this.pruneExpiredPresence(now);

      const systems = await this.listSchedulableSystems();
      const activeSystemIds = await this.loadActiveSystemIds(now);

      for (const system of systems) {
        const provider = this.resolveProvider(system);
        if (!provider || !this.hasBinding(system, provider)) {
          await this.resetUnschedulableState(system, provider);
          continue;
        }

        const tier = this.resolveRealtimeTier(system, activeSystemIds.has(system.id));

        if (this.isRealtimeDue(system, tier, now)) {
          await this.runSync(system, provider, 'REALTIME', tier, now);
        }

        if (this.isHistoryDue(system, now)) {
          await this.runSync(system, provider, 'HISTORY', tier, now);
        }
      }
    } finally {
      this.queueRunning = false;
    }
  }

  @Cron('55 23 * * *', { timeZone: MONITOR_SYNC_TIMEZONE })
  async runEndOfDayClosingAt2355() {
    await this.runClosingJob(new Date(), '23:55');
  }

  @Cron('5 0 * * *', { timeZone: MONITOR_SYNC_TIMEZONE })
  async runEndOfDayClosingAt0005() {
    const reference = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.runClosingJob(reference, '00:05');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupRealtimeRetention() {
    if (!this.schedulerEnabled() || this.cleanupRunning) {
      return;
    }

    this.cleanupRunning = true;
    try {
      const retentionHours = this.getRealtimeRetentionHours();
      const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

      await this.prisma.systemRealtimeMetric.deleteMany({
        where: {
          capturedAt: {
            lt: cutoff,
          },
        },
      });
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async runClosingJob(referenceDate: Date, label: string) {
    if (!this.schedulerEnabled() || this.closingRunning) {
      return;
    }

    this.closingRunning = true;
    try {
      const targetYear = referenceDate.getFullYear();
      const targetMonth = referenceDate.getMonth() + 1;
      const systems = await this.listSchedulableSystems();

      for (const system of systems) {
        const provider = this.resolveProvider(system);
        if (!provider || !this.hasBinding(system, provider)) {
          continue;
        }

        const log = await this.createSyncLog(system.id, provider, 'DAY_CLOSE', 'ONLINE', {
          status: 'RUNNING',
          message: `Dang chot du lieu cuoi ngay (${label}) cho ky ${String(targetMonth).padStart(
            2,
            '0',
          )}/${targetYear}.`,
        });

        try {
          const monthlyAggregate = await this.upsertMonthlyAggregateFromDaily(
            system,
            provider,
            targetMonth,
            targetYear,
          );
          const billing = await this.syncMonthlyBillingFromDaily(system.id, targetMonth, targetYear);

          await this.finishSyncLog(log.id, {
            status: 'SUCCESS',
            message:
              monthlyAggregate || billing
                ? `Da chot du lieu cuoi ngay va cap nhat billing ky ${String(targetMonth).padStart(
                    2,
                    '0',
                  )}/${targetYear}.`
                : `Khong co du lieu daily hop le de chot ky ${String(targetMonth).padStart(
                    2,
                    '0',
                  )}/${targetYear}.`,
            context: {
              targetMonth,
              targetYear,
              monthlyAggregate,
              billingSynced: billing,
            },
          });

          await this.prisma.solarSystem.update({
            where: { id: system.id },
            data: {
              lastBillingSyncAt: billing ? new Date() : system.lastBillingSyncAt,
            },
          });
        } catch (error) {
          await this.markSyncFailure(system, 'DAY_CLOSE', provider, 'ONLINE', error, {
            logId: log.id,
          });
        }
      }
    } finally {
      this.closingRunning = false;
    }
  }

  private async runSync(
    system: any,
    provider: ManagedProvider,
    scope: SyncScope,
    tier: SyncTier,
    now: Date,
  ) {
    const log = await this.createSyncLog(system.id, provider, scope, tier, {
      status: 'RUNNING',
      message:
        scope === 'REALTIME'
          ? 'Dang dong bo du lieu monitor realtime.'
          : 'Dang dong bo du lieu history/billing.',
    });

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        lastSyncAttemptAt: now,
        lastSyncStatus: 'RUNNING',
      },
    });

    try {
      const result =
        scope === 'REALTIME'
          ? await this.syncRealtime(system, provider)
          : await this.syncHistory(system, provider);

      const completedAt = new Date();

      await this.prisma.solarSystem.update({
        where: { id: system.id },
        data: {
          lastSuccessfulSyncAt: completedAt,
          lastSyncStatus: 'SUCCESS',
          lastSyncErrorStatus: null,
          lastSyncErrorMessage: null,
          lastSyncErrorAt: null,
          ...(scope === 'REALTIME'
            ? {
                lastRealtimeSyncAt: completedAt,
                nextRealtimeSyncAt: this.computeNextRealtimeSyncAt(system, tier, completedAt),
              }
            : {}),
          ...(scope === 'HISTORY'
              ? {
                  lastHourlySyncAt: completedAt,
                  lastDailySyncAt: completedAt,
                  nextHistorySyncAt: this.computeNextHistorySyncAt(completedAt),
                }
              : {}),
        },
      });

      await this.finishSyncLog(log.id, {
        status: 'SUCCESS',
        message:
          scope === 'REALTIME'
            ? 'Dong bo realtime thanh cong.'
            : 'Dong bo history/billing thanh cong.',
        context: result,
      });
    } catch (error) {
      await this.markSyncFailure(system, scope, provider, tier, error, {
        logId: log.id,
      });
    }
  }

  private async syncRealtime(system: any, provider: ManagedProvider) {
    if (provider === 'SEMS_PORTAL') {
      const result = await this.energyRecordsService.syncFromSems(system.id, {
        plantId: system.monitoringPlantId || system.stationId,
      });
      await this.storeRealtimeMetric(system.id, provider, result.snapshot);
      return {
        systemCode: result.systemCode,
        provider,
        monitorAt: result.snapshot.fetchedAt,
      };
    }

    if (provider === 'SOLARMAN') {
      const result = await this.energyRecordsService.syncFromSolarman(system.id, {
        stationId: system.monitoringPlantId || system.stationId,
      });
      await this.storeRealtimeMetric(system.id, provider, result.snapshot);
      return {
        systemCode: result.systemCode,
        provider,
        monitorAt: result.snapshot.fetchedAt,
      };
    }

    if (provider === 'DEYE') {
      const result = await this.deyeTelemetrySyncService.syncSystemOperationalData(
        system.deyeConnectionId,
        system.id,
        {
          stationId: system.stationId,
        },
      );
      const snapshot = await this.loadLatestSnapshot(system.id);
      await this.storeRealtimeMetric(system.id, provider, snapshot);
      return {
        provider,
        telemetryRecords: result.telemetryRecords,
        dailyRecords: result.dailyRecords,
        latestTelemetryAt: result.latestTelemetryAt,
      };
    }

    const result = await this.luxPowerConnectionsService.syncRealtimeForSystem(system.id, {
      forceRelogin: false,
    });
    await this.storeRealtimeMetric(system.id, provider, result.snapshot);
    return {
      provider,
      sessionMode: result.sessionMode,
      warnings: result.warnings,
      monitorAt: result.snapshot.fetchedAt,
    };
  }

  private async syncHistory(system: any, provider: ManagedProvider) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (provider === 'SEMS_PORTAL') {
      const result = await this.energyRecordsService.syncFromSems(system.id, {
        plantId: system.monitoringPlantId || system.stationId,
        recordDate: this.startOfUtcDay(now).toISOString(),
      });
      await this.upsertMonthlyAggregateFromDaily(system, provider, month, year);
      const billingSynced = await this.syncMonthlyBillingFromDaily(system.id, month, year);

      return {
        provider,
        monitorAt: result.snapshot.fetchedAt,
        billingSynced,
      };
    }

    if (provider === 'SOLARMAN') {
      const result = await this.energyRecordsService.syncFromSolarman(system.id, {
        stationId: system.monitoringPlantId || system.stationId,
        recordDate: this.startOfUtcDay(now).toISOString(),
      });
      await this.upsertMonthlyAggregateFromDaily(system, provider, month, year);
      const billingSynced = await this.syncMonthlyBillingFromDaily(system.id, month, year);

      return {
        provider,
        monitorAt: result.snapshot.fetchedAt,
        billingSynced,
      };
    }

    if (provider === 'DEYE') {
      const telemetry = await this.deyeTelemetrySyncService.syncSystemOperationalData(
        system.deyeConnectionId,
        system.id,
        {
          stationId: system.stationId,
        },
      );
      const monthly = await this.deyeHistorySyncService.syncMonthlyHistory(system.deyeConnectionId, {
        year,
        stationIds: [system.stationId],
      });
      await this.upsertMonthlyAggregateFromDaily(system, provider, month, year);
      const billingSynced = await this.syncMonthlyBillingFromDaily(system.id, month, year);

      return {
        provider,
        telemetryRecords: telemetry.telemetryRecords,
        dailyRecords: telemetry.dailyRecords,
        syncedMonths: monthly.syncedMonths,
        syncedBillings: monthly.syncedBillings,
        billingSynced,
      };
    }

    const result = await this.luxPowerConnectionsService.syncNow(system.luxPowerConnection.id, {
      forceRelogin: false,
    });
    await this.upsertMonthlyAggregateFromDaily(system, provider, month, year);
    const billingSynced = await this.syncMonthlyBillingFromDaily(system.id, month, year);

    return {
      provider,
      sessionMode: result.sessionMode,
      dailySynced: result.dailySynced,
      monthlySynced: result.monthlySynced,
      billingSynced,
    };
  }

  private async upsertMonthlyAggregateFromDaily(
    system: any,
    provider: ManagedProvider,
    month: number,
    year: number,
  ) {
    const range = this.getMonthDateRange(year, month);
    const aggregate = await this.prisma.energyRecord.aggregate({
      where: {
        solarSystemId: system.id,
        recordDate: {
          gte: range.from,
          lte: range.to,
        },
      },
      _sum: {
        solarGeneratedKwh: true,
        loadConsumedKwh: true,
      },
      _count: {
        _all: true,
      },
    });

    const pvGenerationKwh = this.toNullableNumber(aggregate._sum.solarGeneratedKwh);
    if (pvGenerationKwh === null || pvGenerationKwh <= 0) {
      return false;
    }

    const loadConsumedKwh = this.toNullableNumber(aggregate._sum.loadConsumedKwh);
    const unitPrice = this.toPositiveNumber(system.defaultUnitPrice);
    const vatRate = this.toPositiveNumber(system.defaultVatRate);
    const discountAmount = this.toPositiveNumber(system.defaultDiscountAmount);
    const subtotalAmount = this.roundAmount(pvGenerationKwh * unitPrice);
    const taxAmount = this.roundAmount((subtotalAmount * vatRate) / 100);
    const totalAmount = this.roundAmount(Math.max(subtotalAmount + taxAmount - discountAmount, 0));
    const syncTime = new Date();

    await this.prisma.monthlyEnergyRecord.upsert({
      where: {
        solarSystemId_year_month: {
          solarSystemId: system.id,
          year,
          month,
        },
      },
      update: {
        customerId: system.customerId,
        deyeConnectionId: provider === 'DEYE' ? system.deyeConnectionId : null,
        connectionId: provider === 'SOLARMAN' ? system.solarmanConnectionId : null,
        stationId: system.stationId || system.monitoringPlantId || system.id,
        pvGenerationKwh,
        loadConsumedKwh,
        unitPrice,
        subtotalAmount,
        vatRate,
        taxAmount,
        discountAmount,
        totalAmount,
        source: `${provider}_DAILY_AGGREGATE`,
        syncTime,
        rawPayload: {
          provider,
          aggregatedFrom: 'energy_records',
          dayCount: aggregate._count._all,
        } as any,
        deletedAt: null,
      },
      create: {
        solarSystemId: system.id,
        customerId: system.customerId,
        deyeConnectionId: provider === 'DEYE' ? system.deyeConnectionId : null,
        connectionId: provider === 'SOLARMAN' ? system.solarmanConnectionId : null,
        stationId: system.stationId || system.monitoringPlantId || system.id,
        year,
        month,
        pvGenerationKwh,
        loadConsumedKwh,
        unitPrice,
        subtotalAmount,
        vatRate,
        taxAmount,
        discountAmount,
        totalAmount,
        source: `${provider}_DAILY_AGGREGATE`,
        syncTime,
        rawPayload: {
          provider,
          aggregatedFrom: 'energy_records',
          dayCount: aggregate._count._all,
        } as any,
      },
    });

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        lastMonthlySyncAt: syncTime,
      },
    });

    return true;
  }

  private async syncMonthlyBillingFromDaily(systemId: string, month: number, year: number) {
    const range = this.getMonthDateRange(year, month);
    const aggregate = await this.prisma.energyRecord.aggregate({
      where: {
        solarSystemId: systemId,
        recordDate: {
          gte: range.from,
          lte: range.to,
        },
      },
      _sum: {
        solarGeneratedKwh: true,
      },
    });

    const pvGenerationKwh = this.toNullableNumber(aggregate._sum.solarGeneratedKwh);
    if (pvGenerationKwh === null || pvGenerationKwh <= 0) {
      return false;
    }

    await this.monthlyPvBillingsService.sync(systemId, {
      month,
      year,
      pvGenerationKwh,
      source: 'ENERGY_RECORD_AGGREGATE',
      note: 'Auto sync tu daily energy data',
    });

    await this.prisma.solarSystem.update({
      where: { id: systemId },
      data: {
        lastBillingSyncAt: new Date(),
      },
    });

    return true;
  }

  private async storeRealtimeMetric(
    systemId: string,
    provider: ManagedProvider,
    snapshot: Record<string, unknown> | null,
  ) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }

    const capturedAt = this.parseDateOrNull(
      snapshot.fetchedAt || snapshot.runtimeRecordedAt || snapshot.lastRealtimeSyncAt,
    );
    if (!capturedAt) {
      return;
    }

    const pvPowerKw = this.toNullableNumber(
      snapshot.currentPvKw ??
        snapshot.currentGenerationPowerKw ??
        this.scaleWattsToKw(snapshot.pvPowerW),
    );
    const loadPowerKw = this.toNullableNumber(
      snapshot.loadPowerKw ?? this.scaleWattsToKw(snapshot.loadPowerW),
    );
    const gridPowerKw = this.toNullableNumber(
      snapshot.gridPowerKw ??
        snapshot.gridImportKw ??
        this.scaleWattsToKw(snapshot.gridPowerW),
    );
    const batteryPowerKw = this.toNullableNumber(
      snapshot.batteryPowerKw ?? this.scaleWattsToKw(snapshot.batteryPowerW),
    );
    const batterySocPct = this.toNullableNumber(
      snapshot.batterySocPct ?? snapshot.batterySocPercent,
    );
    const inverterStatus =
      (typeof snapshot.connectionStatus === 'string' && snapshot.connectionStatus) ||
      (typeof snapshot.inverterStatus === 'string' && snapshot.inverterStatus) ||
      null;

    await this.prisma.systemRealtimeMetric.upsert({
      where: {
        solarSystemId_capturedAt: {
          solarSystemId: systemId,
          capturedAt,
        },
      },
      update: {
        provider,
        pvPowerKw,
        loadPowerKw,
        gridPowerKw,
        batteryPowerKw,
        batterySocPct,
        inverterStatus,
        sourceSnapshot: snapshot as any,
      },
      create: {
        solarSystemId: systemId,
        provider,
        capturedAt,
        pvPowerKw,
        loadPowerKw,
        gridPowerKw,
        batteryPowerKw,
        batterySocPct,
        inverterStatus,
        sourceSnapshot: snapshot as any,
      },
    });
  }

  private async loadLatestSnapshot(systemId: string) {
    const system = await this.prisma.solarSystem.findUnique({
      where: { id: systemId },
      select: {
        latestMonitorSnapshot: true,
      },
    });

    return system?.latestMonitorSnapshot &&
      typeof system.latestMonitorSnapshot === 'object' &&
      !Array.isArray(system.latestMonitorSnapshot)
      ? (system.latestMonitorSnapshot as Record<string, unknown>)
      : null;
  }

  private async createSyncLog(
    systemId: string,
    provider: ManagedProvider,
    scope: SyncScope,
    tier: SyncTier,
    payload: {
      status: string;
      message: string;
    },
  ) {
    return this.prisma.systemMonitorSyncLog.create({
      data: {
        solarSystemId: systemId,
        provider,
        syncScope: scope,
        scheduleTier: tier,
        status: payload.status,
        startedAt: new Date(),
        message: payload.message,
      },
    });
  }

  private async finishSyncLog(
    id: string,
    payload: {
      status: string;
      message: string;
      context?: Record<string, unknown>;
    },
  ) {
    await this.prisma.systemMonitorSyncLog.update({
      where: { id },
      data: {
        status: payload.status,
        message: payload.message,
        finishedAt: new Date(),
        context: payload.context as any,
      },
    });
  }

  private async markSyncFailure(
    system: any,
    scope: SyncScope,
    provider: ManagedProvider,
    tier: SyncTier,
    error: unknown,
    options: {
      logId: string;
    },
  ) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    const errorStatus = this.classifyErrorStatus(message);
    const now = new Date();

      await this.prisma.solarSystem.update({
        where: { id: system.id },
        data: {
          lastSyncStatus: 'ERROR',
          lastSyncErrorStatus: errorStatus,
          lastSyncErrorMessage: message,
          lastSyncErrorAt: now,
          ...(scope === 'REALTIME'
            ? {
                nextRealtimeSyncAt: this.computeNextRealtimeSyncAt(system, 'BACKOFF', now),
              }
            : {}),
          ...(scope === 'HISTORY'
            ? {
                nextHistorySyncAt: new Date(now.getTime() + 90 * 60 * 1000),
              }
            : {}),
        },
      });

    await this.prisma.systemMonitorSyncLog.update({
      where: { id: options.logId },
      data: {
        status: 'ERROR',
        message,
        errorStatus,
        errorMessage: message,
        finishedAt: now,
      },
    });

    this.logger.warn(`[${provider}:${scope}] ${system.systemCode || system.id}: ${message}`);
  }

  private async listSchedulableSystems() {
    return this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        systemCode: true,
        name: true,
        status: true,
        customerId: true,
        sourceSystem: true,
        monitoringProvider: true,
        monitoringPlantId: true,
        stationId: true,
        latestMonitorAt: true,
        lastRealtimeSyncAt: true,
        lastHourlySyncAt: true,
        lastMonthlySyncAt: true,
        lastBillingSyncAt: true,
        lastSyncAttemptAt: true,
        lastSuccessfulSyncAt: true,
        lastSyncStatus: true,
        lastSyncErrorStatus: true,
        lastSyncErrorMessage: true,
        lastSyncErrorAt: true,
        nextRealtimeSyncAt: true,
        nextHistorySyncAt: true,
        latestMonitorSnapshot: true,
        defaultUnitPrice: true,
        defaultVatRate: true,
        defaultDiscountAmount: true,
        deyeConnectionId: true,
        solarmanConnectionId: true,
        luxPowerConnection: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  private async resetUnschedulableState(system: any, provider: ManagedProvider | null) {
    if (
      system.nextRealtimeSyncAt === null &&
      system.nextHistorySyncAt === null &&
      system.lastSyncStatus !== 'ERROR'
    ) {
      return;
    }

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        nextRealtimeSyncAt: null,
        nextHistorySyncAt: null,
        ...(system.lastSyncStatus === 'ERROR'
          ? {
              lastSyncStatus: null,
              lastSyncErrorStatus: null,
              lastSyncErrorMessage: null,
              lastSyncErrorAt: null,
            }
          : {}),
        metadata: {
          ...(system.metadata && typeof system.metadata === 'object' && !Array.isArray(system.metadata)
            ? (system.metadata as Record<string, unknown>)
            : {}),
          monitorSync: {
            bindingReady: false,
            provider,
            updatedAt: new Date().toISOString(),
          },
        } as any,
      },
    });
  }

  private async loadActiveSystemIds(now: Date) {
    const rows = await this.prisma.systemDashboardPresence.findMany({
      where: {
        expiresAt: {
          gt: now,
        },
      },
      select: {
        solarSystemId: true,
      },
    });

    return new Set(rows.map((item) => item.solarSystemId));
  }

  private async pruneExpiredPresence(now: Date) {
    await this.prisma.systemDashboardPresence.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
  }

  private resolveProvider(system: any): ManagedProvider | null {
    const candidates = [system.sourceSystem, system.monitoringProvider];
    for (const value of candidates) {
      if (typeof value === 'string' && MANAGED_PROVIDERS.has(value as ManagedProvider)) {
        return value as ManagedProvider;
      }
    }

    return null;
  }

  private hasBinding(system: any, provider: ManagedProvider) {
    if (provider === 'SEMS_PORTAL') {
      return Boolean(system.monitoringPlantId || system.stationId);
    }

    if (provider === 'SOLARMAN') {
      return Boolean((system.monitoringPlantId || system.stationId) && system.solarmanConnectionId);
    }

    if (provider === 'DEYE') {
      return Boolean(system.deyeConnectionId && system.stationId);
    }

    return Boolean(system.luxPowerConnection?.id);
  }

  private resolveRealtimeTier(system: any, activelyViewed: boolean): SyncTier {
    const connectionStatus = this.getConnectionStatus(system);
    if (this.isFailureLike(connectionStatus) || system.lastSyncErrorAt) {
      const lastErrorAt = this.parseDateOrNull(system.lastSyncErrorAt);
      if (!lastErrorAt || Date.now() - lastErrorAt.getTime() < 2 * 60 * 60 * 1000) {
        return 'BACKOFF';
      }
    }

    if (activelyViewed) {
      return 'ACTIVE_VIEW';
    }

    const latestMonitorAt = this.parseDateOrNull(system.latestMonitorAt);
    if (latestMonitorAt && Date.now() - latestMonitorAt.getTime() < 30 * 60 * 1000) {
      return 'ONLINE';
    }

    return 'IDLE';
  }

  private isRealtimeDue(system: any, tier: SyncTier, now: Date) {
    const nextAt = this.parseDateOrNull(system.nextRealtimeSyncAt);
    if (nextAt) {
      return nextAt.getTime() <= now.getTime();
    }

    const lastAt = this.parseDateOrNull(system.lastRealtimeSyncAt);
    if (!lastAt) {
      return true;
    }

    const intervalMinutes = this.getRealtimeIntervalMinutes(tier);
    return now.getTime() - lastAt.getTime() >= intervalMinutes * 60 * 1000;
  }

  private isHistoryDue(system: any, now: Date) {
    const nextAt = this.parseDateOrNull(system.nextHistorySyncAt);
    if (nextAt) {
      return nextAt.getTime() <= now.getTime();
    }

    const lastAt = this.parseDateOrNull(system.lastHourlySyncAt);
    if (!lastAt) {
      return true;
    }

    return now.getTime() - lastAt.getTime() >= 60 * 60 * 1000;
  }

  private computeNextRealtimeSyncAt(system: any, tier: SyncTier, from: Date) {
    const minutes = this.getRealtimeIntervalMinutes(tier);
    return new Date(from.getTime() + minutes * 60 * 1000);
  }

  private computeNextHistorySyncAt(from: Date) {
    return new Date(from.getTime() + 60 * 60 * 1000);
  }

  private getRealtimeIntervalMinutes(tier: SyncTier) {
    if (tier === 'ACTIVE_VIEW') {
      return this.getConfigNumber('MONITOR_SYNC_REALTIME_ACTIVE_MINUTES', 1);
    }

    if (tier === 'ONLINE') {
      return this.getConfigNumber('MONITOR_SYNC_REALTIME_DEFAULT_MINUTES', 5);
    }

    if (tier === 'BACKOFF') {
      return this.getConfigNumber('MONITOR_SYNC_REALTIME_BACKOFF_MINUTES', 20);
    }

    return this.getConfigNumber('MONITOR_SYNC_REALTIME_IDLE_MINUTES', 10);
  }

  private getRealtimeRetentionHours() {
    return this.getConfigNumber('MONITOR_SYNC_REALTIME_RETENTION_HOURS', 48);
  }

  private schedulerEnabled() {
    return (
      String(this.configService.get('MONITOR_SYNC_SCHEDULER_ENABLED') ?? 'true').toLowerCase() !==
      'false'
    );
  }

  private getConfigNumber(key: string, fallback: number) {
    const raw = Number(this.configService.get(key) ?? fallback);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private getConnectionStatus(system: any) {
    const snapshot =
      system.latestMonitorSnapshot &&
      typeof system.latestMonitorSnapshot === 'object' &&
      !Array.isArray(system.latestMonitorSnapshot)
        ? (system.latestMonitorSnapshot as Record<string, unknown>)
        : {};

    return String(snapshot.connectionStatus || snapshot.inverterStatus || '').toUpperCase();
  }

  private isFailureLike(status: string) {
    return (
      status.includes('OFFLINE') ||
      status.includes('FAULT') ||
      status.includes('ERROR') ||
      status.includes('DISCONNECT')
    );
  }

  private classifyErrorStatus(message: string) {
    const normalized = message.toLowerCase();
    if (
      normalized.includes('offline') ||
      normalized.includes('timeout') ||
      normalized.includes('session') ||
      normalized.includes('expired')
    ) {
      return 'BACKOFF';
    }

    return 'ERROR';
  }

  private parseDateOrNull(value: unknown) {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private scaleWattsToKw(value: unknown) {
    const numeric = this.toNullableNumber(value);
    return numeric === null ? null : Number((numeric / 1000).toFixed(3));
  }

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toPositiveNumber(value: unknown) {
    const numeric = this.toNullableNumber(value) || 0;
    return Number(numeric.toFixed(2));
  }

  private roundAmount(value: number) {
    return Number((value || 0).toFixed(2));
  }

  private startOfUtcDay(reference: Date) {
    const next = new Date(reference);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  private getMonthDateRange(year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { from, to };
  }
}
