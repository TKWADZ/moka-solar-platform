import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { hasPermission } from '../common/auth/permissions';
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
import { toNumber } from '../common/helpers/domain.helper';
import { decryptSecret, encryptSecret } from '../common/helpers/secret.helper';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { deriveSystemStatusFromMonitoring } from '../systems/system-status.util';
import { CreateLuxPowerConnectionDto } from './dto/create-luxpower-connection.dto';
import { SyncLuxPowerConnectionDto } from './dto/sync-luxpower-connection.dto';
import { UpdateLuxPowerConnectionDto } from './dto/update-luxpower-connection.dto';
import {
  LuxPowerConnectionConfig,
  LuxPowerClientService,
  LuxPowerMonitoringBundle,
} from './luxpower-client.service';
import { LuxPowerSnapshot } from './luxpower.parser';

type LuxPowerConnectionRecord = any;
type SolarSystemRecord = any;
type BillingMetricSource =
  | 'PV_MONTHLY_GENERATION'
  | 'E_INV_DAY'
  | 'E_TO_USER_DAY'
  | 'E_CONSUMPTION_DAY';

type LuxPowerMonthlyPreviewRow = {
  periodKey: string;
  year: number;
  month: number;
  sourceMode: 'AGGREGATED_DAILY' | 'PROVIDER_MONTHLY';
  contractId: string | null;
  contractNumber: string | null;
  billingSource: BillingMetricSource | null;
  billingSourceLabel: string | null;
  sourceValueKwh: number | null;
  billedPvTotalKwh: number | null;
  pvGenerationKwh: number | null;
  loadConsumptionKwh: number | null;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
  unitPrice: number | null;
  subtotalAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  ready: boolean;
  reasons: string[];
  metric: Record<string, unknown>;
};

type LuxPowerBillingAuditRow = {
  periodKey: string;
  year: number;
  month: number;
  rawPvTotal: number | null;
  normalizedPvTotal: number | null;
  billedPvTotal: number | null;
  sourceValueKwh: number | null;
  billingSource: BillingMetricSource | null;
  billingSourceLabel: string | null;
  missingDays: number[];
  dayCount: number;
};

type NormalizedMetricDraft = {
  granularity: 'REALTIME' | 'DAILY' | 'MONTHLY' | 'TOTAL';
  periodKey: string;
  metricDate: Date | null;
  year: number | null;
  month: number | null;
  pvPowerW?: number | null;
  loadPowerW?: number | null;
  gridPowerW?: number | null;
  batteryPowerW?: number | null;
  batterySocPercent?: number | null;
  acCouplePowerW?: number | null;
  currentPvPowerKw?: number | null;
  currentLoadPowerKw?: number | null;
  currentBatterySoc?: number | null;
  dailyInverterOutputKwh?: number | null;
  dailyToUserKwh?: number | null;
  dailyConsumptionKwh?: number | null;
  monthlyInverterOutputKwh?: number | null;
  monthlyToUserKwh?: number | null;
  monthlyConsumptionKwh?: number | null;
  dailyPvKwh?: number | null;
  monthlyPvKwh?: number | null;
  totalPvKwh?: number | null;
  gridImportKwh?: number | null;
  gridExportKwh?: number | null;
  capturedAt: Date;
  rawPayload: Record<string, unknown>;
};

type NormalizedBundle = {
  realtime: NormalizedMetricDraft | null;
  daily: NormalizedMetricDraft[];
  monthly: NormalizedMetricDraft[];
  total: NormalizedMetricDraft | null;
};

type LinkageContext = {
  customerId: string | null;
  solarSystemId: string | null;
  contractId: string | null;
  billingRuleLabel: string | null;
  customer: any | null;
  solarSystem: any | null;
  contract: any | null;
};

type SystemSyncUpdateResult = {
  system: any;
  warnings: string[];
};

const BILLING_SOURCE_OPTIONS: Array<{
  value: BillingMetricSource;
  label: string;
  field: keyof NormalizedMetricDraft;
}> = [
  {
    value: 'PV_MONTHLY_GENERATION',
    label: 'PV tháng',
    field: 'monthlyPvKwh',
  },
  {
    value: 'E_INV_DAY',
    label: 'Sản lượng inverter',
    field: 'monthlyInverterOutputKwh',
  },
  {
    value: 'E_TO_USER_DAY',
    label: 'Điện cấp cho tải',
    field: 'monthlyToUserKwh',
  },
  {
    value: 'E_CONSUMPTION_DAY',
    label: 'Tổng điện tiêu thụ',
    field: 'monthlyConsumptionKwh',
  },
];

@Injectable()
export class LuxPowerConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LuxPowerConnectionsService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private syncRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly luxPowerClientService: LuxPowerClientService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  onModuleInit() {
    const minutes = Number(this.configService.get('LUXPOWER_SYNC_SCAN_MINUTES') || 5);
    if (minutes > 0) {
      this.syncInterval = setInterval(() => {
        void this.syncDueConnections();
      }, minutes * 60 * 1000);
    }
  }

  onModuleDestroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  async listConnections(actor?: AuthenticatedUser) {
    const connections = await this.prisma.luxPowerConnection.findMany({
      where: { deletedAt: null },
      include: this.includeRelations(),
      orderBy: { createdAt: 'desc' },
    });

    const canViewSecrets = hasPermission(actor?.permissions, 'integration.secrets.view');
    const canViewDebug = actor?.role === 'SUPER_ADMIN';
    return connections.map((connection) =>
      this.serializeConnection(connection, canViewSecrets, canViewDebug),
    );
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const connection = await this.getConnectionOrThrow(id);
    const canViewDebug = actor?.role === 'SUPER_ADMIN';
    return this.serializeConnection(
      connection,
      hasPermission(actor?.permissions, 'integration.secrets.view'),
      canViewDebug,
    );
  }

  async listLogs(id: string) {
    await this.ensureConnectionExists(id);

    return this.prisma.luxPowerSyncLog.findMany({
      where: { connectionId: id },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  }

  async create(dto: CreateLuxPowerConnectionDto, actorId?: string) {
    this.assertCredentialMode(dto.useDemoMode, dto.username, dto.password);
    const linkage = await this.resolveLinkageContext(dto);

    const connection = await this.prisma.luxPowerConnection.create({
      data: {
        accountName: dto.accountName.trim(),
        username: dto.username?.trim() || null,
        passwordEncrypted: dto.password?.trim()
          ? encryptSecret(dto.password.trim(), this.getEncryptionSecret())
          : null,
        plantId: dto.plantId?.trim() || null,
        inverterSerial: dto.inverterSerial?.trim() || null,
        customerId: linkage.customerId,
        solarSystemId: linkage.solarSystemId,
        contractId: linkage.contractId,
        billingRuleLabel: linkage.billingRuleLabel,
        pollingIntervalMinutes: dto.pollingIntervalMinutes ?? 60,
        useDemoMode: dto.useDemoMode ?? false,
        status: dto.status?.trim() || 'PENDING',
        notes: dto.notes?.trim() || null,
      },
      include: this.includeRelations(),
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'LUXPOWER_CONNECTION_CREATED',
      entityType: 'LuxPowerConnection',
      entityId: connection.id,
      payload: {
        accountName: connection.accountName,
        customerId: connection.customerId,
        solarSystemId: connection.solarSystemId,
        contractId: connection.contractId,
        billingRuleLabel: connection.billingRuleLabel,
        useDemoMode: connection.useDemoMode,
      },
    });

    return this.serializeConnection(connection);
  }

  async update(id: string, dto: UpdateLuxPowerConnectionDto, actorId?: string) {
    const existing = await this.getConnectionOrThrow(id);
    const nextUseDemoMode = dto.useDemoMode ?? existing.useDemoMode;
    const nextUsername =
      dto.username === undefined ? existing.username : dto.username?.trim() || null;
    const nextPasswordEncrypted =
      dto.password === undefined
        ? existing.passwordEncrypted
        : dto.password?.trim()
          ? encryptSecret(dto.password.trim(), this.getEncryptionSecret())
          : null;

    this.assertCredentialMode(
      nextUseDemoMode,
      nextUsername,
      nextPasswordEncrypted
        ? decryptSecret(nextPasswordEncrypted, this.getEncryptionSecret())
        : null,
    );
    const linkage = await this.resolveLinkageContext(dto, existing);

    const updated = await this.prisma.luxPowerConnection.update({
      where: { id },
      data: {
        accountName: dto.accountName?.trim() ?? existing.accountName,
        username: nextUsername,
        passwordEncrypted: nextPasswordEncrypted,
        plantId: dto.plantId === undefined ? existing.plantId : dto.plantId?.trim() || null,
        inverterSerial:
          dto.inverterSerial === undefined
            ? existing.inverterSerial
            : dto.inverterSerial?.trim() || null,
        customerId: linkage.customerId,
        solarSystemId: linkage.solarSystemId,
        contractId: linkage.contractId,
        billingRuleLabel: linkage.billingRuleLabel,
        pollingIntervalMinutes:
          dto.pollingIntervalMinutes ?? existing.pollingIntervalMinutes,
        useDemoMode: nextUseDemoMode,
        status: dto.status?.trim() ?? existing.status,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    this.luxPowerClientService.clearSession(id);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'LUXPOWER_CONNECTION_UPDATED',
      entityType: 'LuxPowerConnection',
      entityId: id,
      payload: {
        accountName: updated.accountName,
        customerId: updated.customerId,
        solarSystemId: updated.solarSystemId,
        contractId: updated.contractId,
        billingRuleLabel: updated.billingRuleLabel,
        pollingIntervalMinutes: updated.pollingIntervalMinutes,
        useDemoMode: updated.useDemoMode,
      },
    });

    return this.serializeConnection(updated);
  }

  async remove(id: string, actorId?: string) {
    await this.getConnectionOrThrow(id);

    this.luxPowerClientService.clearSession(id);
    await this.prisma.luxPowerConnection.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'LUXPOWER_CONNECTION_ARCHIVED',
      entityType: 'LuxPowerConnection',
      entityId: id,
    });

    return { success: true };
  }

  async testConnection(id: string, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    const log = await this.createLog(connection.id, {
      action: 'TEST_CONNECTION',
      status: 'RUNNING',
      message: 'Dang kiem tra session va du lieu monitor LuxPower.',
    });

    try {
      const result = await this.luxPowerClientService.testConnection(
        this.toClientConfig(connection),
      );
      const normalized = this.normalizeBundle(result);
      await this.persistBundleSnapshots(connection, result, normalized, false);
      const now = new Date();

      await this.prisma.luxPowerConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ACTIVE',
          plantId: connection.plantId || result.snapshot.plantId || null,
          inverterSerial: connection.inverterSerial || result.snapshot.serialNumber || null,
          lastLoginAt: result.sessionMode === 'LOGIN' ? now : connection.lastLoginAt,
          authReadyAt: now,
          plantLinkedAt: this.computePlantLinkedAt(
            {
              ...connection,
              plantId: connection.plantId || result.snapshot.plantId,
              inverterSerial: connection.inverterSerial || result.snapshot.serialNumber,
            },
            result,
          ),
          metricsAvailableAt: this.hasAvailableMetrics(result, normalized)
            ? connection.metricsAvailableAt || now
            : connection.metricsAvailableAt,
          lastError: null,
          lastProviderResponse: {
            snapshot: result.snapshot,
            plantDetail: result.plantDetail,
            warnings: result.warnings,
          } as any,
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `LuxPower ${result.sessionMode === 'DEMO' ? 'demo' : 'login'} OK. Da lay duoc realtime, daily va monthly aggregate.`,
        context: {
          sessionMode: result.sessionMode,
          warnings: result.warnings,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
          dailyPoints: result.dailyAggregatePoints.length,
          monthlyPoints: result.monthlyAggregatePoints.length,
        },
        responsePayload: {
          snapshot: result.snapshot,
          plantDetail: result.plantDetail,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'LUXPOWER_CONNECTION_TESTED',
        entityType: 'LuxPowerConnection',
        entityId: id,
        payload: {
          sessionMode: result.sessionMode,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
        },
      });

      return {
        connection: await this.findOne(id),
        sessionMode: result.sessionMode,
        warnings: result.warnings,
        plants: result.resolvedTarget.plants,
        inverters: result.resolvedTarget.inverters,
        plantDetail: result.plantDetail,
        snapshot: result.snapshot,
        dailyAggregatePoints: result.dailyAggregatePoints,
        monthlyAggregatePoints: result.monthlyAggregatePoints,
        lifetimeAggregatePoints: result.lifetimeAggregatePoints,
      };
    } catch (error) {
      await this.prisma.luxPowerConnection.update({
        where: { id },
        data: {
          status: 'ERROR',
          lastError: this.formatErrorMessage(error, 'LuxPower test that bai.'),
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'LuxPower test that bai.'),
      });

      throw error;
    }
  }

  async previewPipeline(
    id: string,
    dto: SyncLuxPowerConnectionDto,
    actor?: AuthenticatedUser,
  ) {
    const connection = await this.getConnectionOrThrow(id);
    const result = await this.luxPowerClientService.fetchConnectionSnapshot(
      this.toClientConfig(connection),
      { forceRelogin: dto.forceRelogin },
    );
    const normalized = this.normalizeBundle(result);
    const billingPreview = await this.buildMonthlyBillingPreview(connection, normalized.monthly);
    const canViewDebug = actor?.role === 'SUPER_ADMIN';

    return {
      connection: this.serializeConnection(
        connection,
        hasPermission(actor?.permissions, 'integration.secrets.view'),
        canViewDebug,
      ),
      sessionMode: result.sessionMode,
      warnings: result.warnings,
      plantDetail: result.plantDetail,
      snapshot: result.snapshot,
      rawPayloads: canViewDebug
        ? result.rawPayloads
        : {
            runtime: result.rawPayloads.runtime,
            energy: result.rawPayloads.energy,
            dailyAggregate: Array.isArray(result.rawPayloads.dailyAggregate)
              ? result.rawPayloads.dailyAggregate.map((item: any) => ({
                  year: item.year,
                  month: item.month,
                  warning: item.warning || null,
                }))
              : [],
            monthlyAggregate: Array.isArray(result.rawPayloads.monthlyAggregate)
              ? result.rawPayloads.monthlyAggregate.map((item: any) => ({
                  year: item.year,
                  warning: item.warning || null,
                }))
              : [],
          },
      normalized: {
        realtime: normalized.realtime ? this.serializeNormalizedMetric(normalized.realtime, canViewDebug) : null,
        daily: normalized.daily.map((item) => this.serializeNormalizedMetric(item, canViewDebug)),
        monthly: normalized.monthly.map((item) => this.serializeNormalizedMetric(item, canViewDebug)),
        total: normalized.total ? this.serializeNormalizedMetric(normalized.total, canViewDebug) : null,
      },
      billingPreview,
    };
  }

  async syncNow(id: string, dto: SyncLuxPowerConnectionDto, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    return this.syncSingleConnection(connection, dto, actorId, 'MANUAL_SYNC');
  }

  async previewForSystem(
    systemId: string,
    params: {
      connectionId: string;
      plantId?: string | null;
      inverterSerial?: string | null;
    },
    actorId?: string,
  ) {
    const system = await this.getSystemOrThrow(systemId);
    const connection = await this.getConnectionOrThrow(params.connectionId);
    const linkedSystem =
      connection.solarSystem && connection.solarSystem.deletedAt === null
        ? this.serializeLinkedSystem(connection.solarSystem)
        : null;
    const effectiveConnection = this.applyRuntimeOverrides(connection, params);
    const result = await this.luxPowerClientService.testConnection(
      this.toClientConfig(effectiveConnection),
    );
    const normalized = this.normalizeBundle(result);
    const preview = this.buildSystemMonitorPreview(result, normalized, effectiveConnection);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'LUXPOWER_SYSTEM_PREVIEWED',
      entityType: 'SolarSystem',
      entityId: system.id,
      payload: {
        connectionId: connection.id,
        plantId: preview.plantId,
        inverterSerial: preview.inverterSerial,
      },
    });

    return {
      connection: {
        id: connection.id,
        accountName: connection.accountName,
        status: connection.status,
        linkedSystem,
      },
      snapshot: preview,
      warnings: result.warnings,
      plantDetail: result.plantDetail,
    };
  }

  async syncToSystem(
    systemId: string,
    params: {
      connectionId: string;
      plantId?: string | null;
      inverterSerial?: string | null;
      forceRelogin?: boolean;
    },
    actorId?: string,
  ) {
    const system = await this.getSystemOrThrow(systemId);
    const connection = await this.getConnectionOrThrow(params.connectionId);

    if (connection.solarSystemId && connection.solarSystemId !== system.id) {
      throw new BadRequestException(
        `LuxPower connection nay dang gan voi he thong ${connection.solarSystem?.name || connection.solarSystemId}.`,
      );
    }

    const nextConnection = await this.prisma.luxPowerConnection.update({
      where: { id: connection.id },
      data: {
        customerId: system.customerId || connection.customerId,
        solarSystemId: system.id,
        plantId:
          params.plantId !== undefined
            ? params.plantId?.trim() || null
            : connection.plantId || system.monitoringPlantId || null,
        inverterSerial:
          params.inverterSerial !== undefined
            ? params.inverterSerial?.trim() || null
            : connection.inverterSerial || null,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (
      (params.plantId !== undefined && params.plantId?.trim() !== (connection.plantId || '')) ||
      (params.inverterSerial !== undefined &&
        params.inverterSerial?.trim() !== (connection.inverterSerial || ''))
    ) {
      this.luxPowerClientService.clearSession(connection.id);
    }

    const result = await this.syncSingleConnection(
      nextConnection,
      { forceRelogin: params.forceRelogin },
      actorId,
      'SYSTEM_SYNC',
    );

    return {
      systemId: system.id,
      systemCode: system.systemCode,
      provider: 'LUXPOWER',
      snapshot: this.buildSystemMonitorSnapshot({
        snapshot: result.snapshot,
        connection: nextConnection,
      }),
      connectionId: nextConnection.id,
      dailySynced: result.dailySynced || 0,
      monthlySynced: result.monthlySynced || 0,
      billingSynced: result.billingSynced || 0,
      warnings: result.warnings || [],
      system: result.system || null,
    };
  }

  private async getSystemOrThrow(systemId: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });

    if (!system) {
      throw new NotFoundException('He thong Moka khong ton tai.');
    }

    return system;
  }

  private applyRuntimeOverrides(
    connection: LuxPowerConnectionRecord,
    params: {
      plantId?: string | null;
      inverterSerial?: string | null;
    },
  ) {
    return {
      ...connection,
      plantId:
        params.plantId !== undefined
          ? params.plantId?.trim() || null
          : connection.plantId || null,
      inverterSerial:
        params.inverterSerial !== undefined
          ? params.inverterSerial?.trim() || null
          : connection.inverterSerial || null,
    };
  }

  private serializeLinkedSystem(system: any) {
    if (!system) {
      return null;
    }

    return {
      id: system.id,
      name: system.name,
      systemCode: system.systemCode,
      stationId: system.stationId || null,
    };
  }

  private buildSystemMonitorPreview(
    result: LuxPowerMonitoringBundle,
    normalized: NormalizedBundle,
    connection?: Partial<LuxPowerConnectionRecord> | null,
  ) {
    return this.buildSystemMonitorSnapshot({
      snapshot: result.snapshot,
      connection: connection || undefined,
      normalized,
    });
  }

  private buildSystemMonitorSnapshot(params: {
    snapshot: LuxPowerSnapshot;
    connection?: Partial<LuxPowerConnectionRecord> | null;
    normalized?: Partial<NormalizedBundle> | null;
  }) {
    const snapshot = params.snapshot;
    const dailyMetrics = Array.isArray(params.normalized?.daily)
      ? [...params.normalized!.daily!]
      : [];
    const monthlyMetrics = Array.isArray(params.normalized?.monthly)
      ? [...params.normalized!.monthly!]
      : [];
    const totalMetric = params.normalized?.total || null;
    const latestDaily = dailyMetrics
      .sort((left, right) =>
        (right.metricDate?.toISOString() || '').localeCompare(
          left.metricDate?.toISOString() || '',
        ),
      )
      .at(0);
    const latestMonthly = monthlyMetrics
      .sort((left, right) =>
        `${right.year || ''}-${String(right.month || '').padStart(2, '0')}`.localeCompare(
          `${left.year || ''}-${String(left.month || '').padStart(2, '0')}`,
        ),
      )
      .at(0);
    const latestAt = this.parseDateOrNull(snapshot.runtimeRecordedAt || snapshot.fetchedAt) || null;

    return {
      provider: 'LUXPOWER',
      sourceMode: snapshot.sourceMode,
      plantId: snapshot.plantId || params.connection?.plantId || null,
      plantName: snapshot.plantName || null,
      currentPvKw: this.toNullableNumber(snapshot.currentPvKw),
      batterySocPct: this.toNullableNumber(snapshot.batterySocPct),
      batteryPowerKw: this.toNullableNumber(snapshot.batteryPowerKw),
      loadPowerKw: this.toNullableNumber(snapshot.loadPowerKw),
      gridImportKw: this.toNullableNumber(snapshot.gridImportKw),
      gridExportKw: this.toNullableNumber(snapshot.gridExportKw),
      todayGeneratedKwh:
        this.toNullableNumber(snapshot.todayGenerationKwh) ??
        this.toNullableNumber(latestDaily?.dailyPvKwh) ??
        this.toNullableNumber(latestDaily?.dailyInverterOutputKwh),
      totalGeneratedKwh:
        this.toNullableNumber(snapshot.totalGenerationKwh) ??
        this.toNullableNumber(totalMetric?.totalPvKwh) ??
        this.toNullableNumber(latestMonthly?.monthlyPvKwh) ??
        this.toNullableNumber(latestMonthly?.monthlyInverterOutputKwh),
      todayLoadConsumedKwh: this.toNullableNumber(latestDaily?.dailyConsumptionKwh),
      todayGridImportedKwh: this.toNullableNumber(latestDaily?.dailyToUserKwh),
      todayGridExportedKwh:
        this.toNullableNumber(latestDaily?.gridExportKwh) ??
        this.toNullableNumber(snapshot.todayExportKwh),
      inverterSerial: snapshot.serialNumber || params.connection?.inverterSerial || null,
      inverterStatus: snapshot.inverterStatus || null,
      connectionStatus: this.normalizeConnectionStatus(snapshot.inverterStatus, latestAt),
      daySeries: Array.isArray(snapshot.daySeries)
        ? snapshot.daySeries.map((point) => ({
            recordedAt: point.recordedAt,
            pvPowerKw: this.powerWattsToKw(point.pvPowerW),
            loadPowerKw: this.powerWattsToKw(point.loadPowerW),
            batteryDischargingKw: this.powerWattsToKw(point.batteryPowerW),
          }))
        : [],
      fetchedAt: snapshot.fetchedAt,
      runtimeRecordedAt: snapshot.runtimeRecordedAt,
      raw: snapshot.raw || null,
    };
  }

  private async syncDueConnections() {
    if (this.syncRunning) {
      return;
    }

    this.syncRunning = true;
    try {
      const now = Date.now();
      const connections = await this.prisma.luxPowerConnection.findMany({
        where: {
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'PENDING'],
          },
        },
        include: this.includeRelations(),
      });

      for (const connection of connections) {
        const intervalMinutes = Number(connection.pollingIntervalMinutes || 0);
        if (intervalMinutes <= 0) {
          continue;
        }

        const lastSyncAt = connection.lastSyncTime?.getTime() || 0;
        if (lastSyncAt && now - lastSyncAt < intervalMinutes * 60 * 1000) {
          continue;
        }

        try {
          await this.syncSingleConnection(
            connection,
            { forceRelogin: false },
            undefined,
            'SCHEDULED_SYNC',
          );
        } catch (error) {
          this.logger.error(
            `Scheduled LuxPower sync failed for ${connection.accountName}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }
    } finally {
      this.syncRunning = false;
    }
  }

  private async syncSingleConnection(
    connectionInput: LuxPowerConnectionRecord,
    dto: SyncLuxPowerConnectionDto,
    actorId?: string,
    action = 'MANUAL_SYNC',
  ) {
    const connection =
      connectionInput.syncLogs && connectionInput.solarSystem !== undefined
        ? connectionInput
        : await this.getConnectionOrThrow(connectionInput.id);
    const log = await this.createLog(connection.id, {
      action,
      status: 'RUNNING',
      message: 'Dang dong bo snapshot monitor LuxPower vao he thong noi bo.',
    });

    try {
      const result = await this.luxPowerClientService.fetchConnectionSnapshot(
        this.toClientConfig(connection),
        { forceRelogin: dto.forceRelogin },
      );
      const normalized = this.normalizeBundle(result);
      const refreshedConnection = await this.prisma.luxPowerConnection.findFirst({
        where: { id: connection.id, deletedAt: null },
        include: this.includeRelations(),
      });

      if (!refreshedConnection) {
        throw new NotFoundException('LuxPower connection khong con ton tai.');
      }

      await this.persistBundleSnapshots(refreshedConnection, result, normalized, true);
      await this.upsertNormalizedMetrics(refreshedConnection, result, normalized);

      let updatedSystem = null;
      let systemWarnings: string[] = [];
      let systemUpdated = false;
      let dailySynced = 0;
      let monthlySynced = 0;
      let billingSynced = 0;
      let billingWarnings: string[] = [];

      if (refreshedConnection.solarSystemId) {
        const systemUpdate = await this.applySnapshotToSystem(
          refreshedConnection,
          result.snapshot,
          normalized,
        );
        updatedSystem = systemUpdate.system;
        systemWarnings = systemUpdate.warnings;
        systemUpdated = true;
        dailySynced = await this.syncDailyEnergyRecords(refreshedConnection, normalized.daily);
        const monthlyResult = await this.syncMonthlyRecordsAndBillings(
          refreshedConnection,
          normalized.monthly,
          actorId,
        );
        monthlySynced = monthlyResult.monthlySynced;
        billingSynced = monthlyResult.billingSynced;
        billingWarnings = monthlyResult.warnings;
      }

      const now = new Date();
      const nextConnection = await this.prisma.luxPowerConnection.update({
        where: { id: refreshedConnection.id },
        data: {
          status: 'ACTIVE',
          plantId: refreshedConnection.plantId || result.snapshot.plantId || null,
          inverterSerial:
            refreshedConnection.inverterSerial || result.snapshot.serialNumber || null,
          lastLoginAt:
            result.sessionMode === 'LOGIN' ? now : refreshedConnection.lastLoginAt,
          lastSyncTime: now,
          authReadyAt: refreshedConnection.authReadyAt || now,
          metricsAvailableAt: this.hasAvailableMetrics(result, normalized)
            ? refreshedConnection.metricsAvailableAt || now
            : refreshedConnection.metricsAvailableAt,
          plantLinkedAt: this.computePlantLinkedAt(
            {
              ...refreshedConnection,
              plantId: refreshedConnection.plantId || result.snapshot.plantId,
              inverterSerial:
                refreshedConnection.inverterSerial || result.snapshot.serialNumber,
            },
            result,
          ),
          billingReadyAt: this.computeBillingReadyAt(
            refreshedConnection,
            normalized,
            billingSynced > 0,
          ),
          lastError: null,
          lastProviderResponse: {
            snapshot: result.snapshot,
          plantDetail: result.plantDetail,
          warnings: [...result.warnings, ...systemWarnings],
          billingWarnings,
        } as any,
      },
        include: this.includeRelations(),
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: systemUpdated
          ? 'Da luu raw payload, normalized metrics va cap nhat monthly billing tu LuxPower.'
          : 'Da luu raw payload va normalized metrics. Connection chua duoc link voi system de sync billing.',
        context: {
          sessionMode: result.sessionMode,
          warnings: [...result.warnings, ...systemWarnings, ...billingWarnings],
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
          systemUpdated,
          dailySynced,
          monthlySynced,
          billingSynced,
        },
        responsePayload: {
          snapshot: result.snapshot,
          plantDetail: result.plantDetail,
          dailyPoints: result.dailyAggregatePoints.length,
          monthlyPoints: result.monthlyAggregatePoints.length,
          billingSource: this.getResolvedBillingSource(nextConnection),
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'LUXPOWER_CONNECTION_SYNCED',
        entityType: 'LuxPowerConnection',
        entityId: connection.id,
        payload: {
          sessionMode: result.sessionMode,
          systemUpdated,
          solarSystemId: refreshedConnection.solarSystemId,
          contractId: refreshedConnection.contractId,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
          dailySynced,
          monthlySynced,
          billingSynced,
        },
      });

      return {
        connection: this.serializeConnection(nextConnection),
        snapshot: result.snapshot,
        plantDetail: result.plantDetail,
        warnings: [...result.warnings, ...systemWarnings, ...billingWarnings],
        sessionMode: result.sessionMode,
        systemUpdated,
        dailySynced,
        monthlySynced,
        billingSynced,
        system: updatedSystem ? this.serializeSystem(updatedSystem) : null,
      };
    } catch (error) {
      await this.prisma.luxPowerConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ERROR',
          lastError: this.formatErrorMessage(error, 'LuxPower sync that bai.'),
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'LuxPower sync that bai.'),
      });

      throw error;
    }
  }

  private async applySnapshotToSystem(
    connection: LuxPowerConnectionRecord,
    snapshot: LuxPowerSnapshot,
    normalized: NormalizedBundle,
  ): Promise<SystemSyncUpdateResult> {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: connection.solarSystemId,
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });

    if (!system) {
      throw new NotFoundException('He thong duoc lien ket voi LuxPower khong ton tai.');
    }

    const syncTime = new Date();
    const existingSnapshot =
      system.latestMonitorSnapshot &&
      typeof system.latestMonitorSnapshot === 'object' &&
      !Array.isArray(system.latestMonitorSnapshot)
        ? (system.latestMonitorSnapshot as Record<string, unknown>)
        : {};
    const existingScopes =
      existingSnapshot.dataScopes &&
      typeof existingSnapshot.dataScopes === 'object' &&
      !Array.isArray(existingSnapshot.dataScopes)
        ? (existingSnapshot.dataScopes as Record<string, unknown>)
        : {};
    const latestMonthly = normalized.monthly
      .filter((item) => item.year && item.month)
      .sort((left, right) =>
        `${right.year}-${right.month}`.localeCompare(`${left.year}-${left.month}`),
      )[0];
    const billingSource = this.getResolvedBillingSource(connection);
    const billingSourceValue = latestMonthly
      ? this.extractBillingMetricValue(latestMonthly, billingSource)
      : null;
    const connectionStatus = this.normalizeConnectionStatus(
      snapshot.inverterStatus,
      snapshot.runtimeRecordedAt ? new Date(snapshot.runtimeRecordedAt) : syncTime,
    );
    const desiredStationId = snapshot.plantId || system.stationId || null;
    const stationBinding = await this.resolveLuxPowerSystemBinding(
      system.id,
      desiredStationId,
      system.sourceSystem || null,
      system.stationId || null,
    );

    const updatedSystem = await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        monitoringProvider: 'LUXPOWER',
        monitoringPlantId: snapshot.plantId || snapshot.serialNumber,
        sourceSystem: stationBinding.sourceSystem,
        stationId: stationBinding.stationId,
        stationName: snapshot.plantName || system.stationName || system.name,
        inverterBrand: system.inverterBrand || 'LuxPower',
        currentGenerationPowerKw:
          snapshot.currentPvKw ?? this.toNullableNumber(system.currentGenerationPowerKw),
        currentMonthGenerationKwh:
          latestMonthly?.monthlyPvKwh ??
          latestMonthly?.monthlyInverterOutputKwh ??
          this.toNullableNumber(system.currentMonthGenerationKwh),
        totalGenerationKwh:
          snapshot.totalGenerationKwh ?? this.toNullableNumber(system.totalGenerationKwh),
        latestMonitorAt: syncTime,
        lastRealtimeSyncAt: syncTime,
        lastDailySyncAt: normalized.daily.length ? syncTime : system.lastDailySyncAt,
        lastMonthlySyncAt: normalized.monthly.length ? syncTime : system.lastMonthlySyncAt,
        ...(billingSourceValue && connection.contractId
          ? {
              lastBillingSyncAt: syncTime,
            }
          : {}),
        status: deriveSystemStatusFromMonitoring({
          currentStatus: system.status,
          connectionStatus,
          latestTelemetryAt: syncTime,
        }),
        latestMonitorSnapshot: {
          ...existingSnapshot,
          provider: 'LUXPOWER',
          plantId: snapshot.plantId,
          plantName: snapshot.plantName,
          inverterSerial: snapshot.serialNumber,
          pvPowerW: snapshot.pvPowerW,
          loadPowerW: snapshot.loadPowerW,
          gridPowerW: snapshot.gridPowerW,
          batteryPowerW: snapshot.batteryPowerW,
          batterySocPercent: snapshot.batterySocPct,
          acCouplePowerW: snapshot.acCouplePowerW,
          currentPvKw: snapshot.currentPvKw,
          batterySocPct: snapshot.batterySocPct,
          batteryPowerKw: snapshot.batteryPowerKw,
          loadPowerKw: snapshot.loadPowerKw,
          gridImportKw: snapshot.gridImportKw,
          gridExportKw: snapshot.gridExportKw,
          todayGenerationKwh: snapshot.todayGenerationKwh,
          totalGenerationKwh: snapshot.totalGenerationKwh,
          inverterStatus: snapshot.inverterStatus,
          fetchedAt: snapshot.fetchedAt,
          lastRealtimeSyncAt: syncTime.toISOString(),
          lastDailySyncAt: normalized.daily.length
            ? syncTime.toISOString()
            : existingSnapshot.lastDailySyncAt || null,
          lastMonthlySyncAt: normalized.monthly.length
            ? syncTime.toISOString()
            : existingSnapshot.lastMonthlySyncAt || null,
          ...(billingSourceValue && connection.contractId
            ? {
                lastBillingSyncAt: syncTime.toISOString(),
              }
            : {}),
          billingSource,
          monthlyBillingMetricKwh: billingSourceValue,
          connectionStatus,
          dataScopes: {
            ...existingScopes,
            station: stationBinding.sourceSystem === 'LUXPOWER' && Boolean(stationBinding.stationId),
            realtime: true,
            daily: normalized.daily.length > 0,
            monthly: normalized.monthly.length > 0,
            billing: Boolean(connection.contractId && billingSourceValue),
          },
          syncWarnings: stationBinding.warnings,
          raw: snapshot.raw,
        } as any,
      },
    });

    return {
      system: updatedSystem,
      warnings: stationBinding.warnings,
    };
  }

  private normalizeBundle(result: LuxPowerMonitoringBundle): NormalizedBundle {
    const capturedAt = this.parseDateOrNull(result.snapshot.fetchedAt) || new Date();
    const dailyMetrics = this.buildDailyMetrics(result, capturedAt);

    return {
      realtime: this.buildRealtimeMetric(result, capturedAt),
      daily: dailyMetrics,
      monthly: this.buildMonthlyMetrics(result, dailyMetrics, capturedAt),
      total: this.buildTotalMetric(result, capturedAt),
    };
  }

  private buildRealtimeMetric(result: LuxPowerMonitoringBundle, capturedAt: Date) {
    const latestSeriesPoint = result.realtimeSeries.at(-1) || null;
    const rawSource =
      (latestSeriesPoint?.raw as Record<string, unknown> | undefined) ||
      (result.snapshot.raw.runtime as Record<string, unknown>) ||
      {};

    return {
      granularity: 'REALTIME' as const,
      periodKey: 'LATEST',
      metricDate: this.parseDateOrNull(result.snapshot.runtimeRecordedAt) || capturedAt,
      year: capturedAt.getFullYear(),
      month: capturedAt.getMonth() + 1,
      pvPowerW: result.snapshot.pvPowerW,
      loadPowerW: result.snapshot.loadPowerW,
      gridPowerW: result.snapshot.gridPowerW,
      batteryPowerW: result.snapshot.batteryPowerW,
      batterySocPercent: result.snapshot.batterySocPct,
      acCouplePowerW: result.snapshot.acCouplePowerW,
      currentPvPowerKw: result.snapshot.currentPvKw,
      currentLoadPowerKw: result.snapshot.loadPowerKw,
      currentBatterySoc: result.snapshot.batterySocPct,
      totalPvKwh: result.snapshot.totalGenerationKwh,
      capturedAt,
      rawPayload: {
        source: 'REALTIME_SERIES',
        rawPayload: rawSource,
        mappings: {
          pv_power_w: this.buildDirectDebugValue('solarPv', rawSource, result.snapshot.pvPowerW),
          load_power_w: this.buildDirectDebugValue(
            'consumption',
            rawSource,
            result.snapshot.loadPowerW,
          ),
          grid_power_w: this.buildDirectDebugValue(
            'gridPower',
            rawSource,
            result.snapshot.gridPowerW,
          ),
          battery_power_w: this.buildDirectDebugValue(
            'batteryDischarging',
            rawSource,
            result.snapshot.batteryPowerW,
          ),
          battery_soc_percent: this.buildDirectDebugValue(
            'soc',
            rawSource,
            result.snapshot.batterySocPct,
          ),
          ac_couple_power_w: this.buildDirectDebugValue(
            'acCouplePower',
            rawSource,
            result.snapshot.acCouplePowerW,
          ),
        },
      },
    } satisfies NormalizedMetricDraft;
  }

  private buildDailyMetrics(result: LuxPowerMonitoringBundle, referenceDate: Date) {
    const fallbackWindows =
      result.rawPayloads.dailyAggregate && !Array.isArray(result.rawPayloads.dailyAggregate)
        ? [
            {
              year: referenceDate.getFullYear(),
              month: referenceDate.getMonth() + 1,
              payload: result.rawPayloads.dailyAggregate,
              points: result.dailyAggregatePoints,
              warning: null,
            },
          ]
        : [];
    const windows =
      Array.isArray(result.dailyAggregateWindows) && result.dailyAggregateWindows.length
        ? result.dailyAggregateWindows
        : fallbackWindows;

    return windows
      .flatMap((windowItem) =>
        (windowItem.points || []).map((point) => {
          if (!point.day) {
            return null;
          }

          const metricDate = new Date(
            Date.UTC(windowItem.year, windowItem.month - 1, point.day, 0, 0, 0),
          );
          const raw = (point.raw || {}) as Record<string, unknown>;
          const batteryChargeKwh = this.toNullableNumber(point.batteryChargeKwh);
          const batteryDischargeKwh = this.toNullableNumber(point.batteryDischargeKwh);
          const dailyConsumptionKwh = this.toNullableNumber(point.consumptionKwh);
          const dailyToUserKwh = this.toNullableNumber(point.toUserKwh);
          const derivedGridImportKwh = this.deriveGridImportKwh(
            dailyConsumptionKwh,
            dailyToUserKwh,
            batteryDischargeKwh,
          );

          return {
            granularity: 'DAILY' as const,
            periodKey: `${windowItem.year}-${String(windowItem.month).padStart(2, '0')}-${String(point.day).padStart(2, '0')}`,
            metricDate,
            year: windowItem.year,
            month: windowItem.month,
            dailyInverterOutputKwh: point.inverterOutputKwh,
            dailyToUserKwh: point.toUserKwh,
            dailyConsumptionKwh: point.consumptionKwh,
            dailyPvKwh: point.pvGenerationKwh,
            gridImportKwh: derivedGridImportKwh,
            gridExportKwh: point.gridExportKwh,
            capturedAt: referenceDate,
            rawPayload: {
              source: 'DAILY_AGGREGATE',
              aggregateWindow: {
                year: windowItem.year,
                month: windowItem.month,
                warning: windowItem.warning || null,
              },
              rawPayload: raw,
              derived: {
                battery_charge_kwh: batteryChargeKwh,
                battery_discharge_kwh: batteryDischargeKwh,
                grid_import_kwh: derivedGridImportKwh,
              },
              mappings: {
                daily_inverter_output_kwh: this.buildScaledDebugValue(
                  'eInvDay',
                  raw,
                  point.inverterOutputKwh,
                ),
                daily_to_user_kwh: this.buildScaledDebugValue(
                  'eToUserDay',
                  raw,
                  point.toUserKwh,
                ),
                daily_consumption_kwh: this.buildScaledDebugValue(
                  'eConsumptionDay',
                  raw,
                  point.consumptionKwh,
                ),
                daily_pv_kwh: this.buildScaledDebugValue(
                  ['ePv1Day', 'ePv2Day', 'ePv3Day'],
                  raw,
                  point.pvGenerationKwh,
                ),
                grid_export_kwh: this.buildScaledDebugValue(
                  'eToGridDay',
                  raw,
                  point.gridExportKwh,
                ),
                battery_charge_kwh: this.buildScaledDebugValue(
                  'eChgDay',
                  raw,
                  batteryChargeKwh,
                ),
                battery_discharge_kwh: this.buildScaledDebugValue(
                  'eDisChgDay',
                  raw,
                  batteryDischargeKwh,
                ),
                grid_import_kwh: {
                  raw_field: ['eConsumptionDay', 'eToUserDay', 'eDisChgDay'],
                  raw_value: [
                    this.toNullableNumber(raw.eConsumptionDay),
                    this.toNullableNumber(raw.eToUserDay),
                    this.toNullableNumber(raw.eDisChgDay),
                  ],
                  scale_factor: 0.1,
                  normalized_value: derivedGridImportKwh,
                },
              },
            },
          } satisfies NormalizedMetricDraft;
        }),
      )
      .filter((item): item is Exclude<typeof item, null> => item !== null);
  }

  private buildMonthlyMetrics(
    result: LuxPowerMonitoringBundle,
    dailyMetrics: NormalizedMetricDraft[],
    referenceDate: Date,
  ) {
    const providerMonthlyMap = new Map<
      string,
      { year: number; month: number; raw: Record<string, unknown>; point: any }
    >();

    for (const windowItem of result.monthlyAggregateWindows || []) {
      for (const point of windowItem.points || []) {
        if (!point.month) {
          continue;
        }

        providerMonthlyMap.set(`${windowItem.year}-${String(point.month).padStart(2, '0')}`, {
          year: windowItem.year,
          month: point.month,
          raw: (point.raw || {}) as Record<string, unknown>,
          point,
        });
      }
    }

    const aggregatedDailyMap = new Map<
      string,
      {
        year: number;
        month: number;
        pointCount: number;
        periodKeys: string[];
        dailyInverterOutputKwh: number;
        dailyToUserKwh: number;
        dailyConsumptionKwh: number;
        dailyPvKwh: number;
        gridImportKwh: number;
        gridExportKwh: number;
        batteryChargeKwh: number;
        batteryDischargeKwh: number;
      }
    >();

    for (const metric of dailyMetrics) {
      if (!metric.year || !metric.month) {
        continue;
      }

      const key = `${metric.year}-${String(metric.month).padStart(2, '0')}`;
      const current =
        aggregatedDailyMap.get(key) ||
        {
          year: metric.year,
          month: metric.month,
          pointCount: 0,
          periodKeys: [],
          dailyInverterOutputKwh: 0,
          dailyToUserKwh: 0,
          dailyConsumptionKwh: 0,
          dailyPvKwh: 0,
          gridImportKwh: 0,
          gridExportKwh: 0,
          batteryChargeKwh: 0,
          batteryDischargeKwh: 0,
        };

      current.pointCount += 1;
      current.periodKeys.push(metric.periodKey);
      current.dailyInverterOutputKwh += this.toNullableNumber(metric.dailyInverterOutputKwh) || 0;
      current.dailyToUserKwh += this.toNullableNumber(metric.dailyToUserKwh) || 0;
      current.dailyConsumptionKwh += this.toNullableNumber(metric.dailyConsumptionKwh) || 0;
      current.dailyPvKwh += this.toNullableNumber(metric.dailyPvKwh) || 0;
      current.gridImportKwh += this.toNullableNumber(metric.gridImportKwh) || 0;
      current.gridExportKwh += this.toNullableNumber(metric.gridExportKwh) || 0;
      current.batteryChargeKwh += this.toDailyDerivedNumber(metric, 'battery_charge_kwh') || 0;
      current.batteryDischargeKwh +=
        this.toDailyDerivedNumber(metric, 'battery_discharge_kwh') || 0;
      aggregatedDailyMap.set(key, current);
    }

    const keys = Array.from(new Set([...aggregatedDailyMap.keys(), ...providerMonthlyMap.keys()]))
      .sort()
      .reverse();

    return keys
      .map((key) => {
        const aggregated = aggregatedDailyMap.get(key) || null;
        const provider = providerMonthlyMap.get(key) || null;
        const year = aggregated?.year || provider?.year || null;
        const month = aggregated?.month || provider?.month || null;

        if (!year || !month) {
          return null;
        }

        const metricDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const sourceMode =
          aggregated && aggregated.pointCount > 0 ? 'MONTHLY_FROM_DAILY' : 'MONTHLY_AGGREGATE';
        const providerPoint = provider?.point || null;
        const providerRaw = provider?.raw || {};
        const monthlyInverterOutputKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.dailyInverterOutputKwh || 0)
            : this.toNullableNumber(providerPoint?.inverterOutputKwh);
        const monthlyToUserKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.dailyToUserKwh || 0)
            : this.toNullableNumber(providerPoint?.toUserKwh);
        const monthlyConsumptionKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.dailyConsumptionKwh || 0)
            : this.toNullableNumber(providerPoint?.consumptionKwh);
        const monthlyPvKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.dailyPvKwh || 0)
            : this.toNullableNumber(providerPoint?.pvGenerationKwh);
        const gridImportKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.gridImportKwh || 0)
            : this.deriveGridImportKwh(
                this.toNullableNumber(providerPoint?.consumptionKwh),
                this.toNullableNumber(providerPoint?.toUserKwh),
                this.toNullableNumber(providerPoint?.batteryDischargeKwh),
              );
        const gridExportKwh =
          sourceMode === 'MONTHLY_FROM_DAILY'
            ? this.roundMetricValue(aggregated?.gridExportKwh || 0)
            : this.toNullableNumber(providerPoint?.gridExportKwh);

        return {
          granularity: 'MONTHLY' as const,
          periodKey: key,
          metricDate,
          year,
          month,
          monthlyInverterOutputKwh,
          monthlyToUserKwh,
          monthlyConsumptionKwh,
          monthlyPvKwh,
          gridImportKwh,
          gridExportKwh,
          capturedAt: referenceDate,
          rawPayload: {
            source: sourceMode,
            aggregateWindow: {
              year,
              month,
            },
            providerMonthlyRaw: providerRaw,
            aggregatedDaily:
              sourceMode === 'MONTHLY_FROM_DAILY'
                ? {
                    pointCount: aggregated?.pointCount || 0,
                    periodKeys: aggregated?.periodKeys || [],
                    battery_charge_kwh: this.roundMetricValue(
                      aggregated?.batteryChargeKwh || 0,
                    ),
                    battery_discharge_kwh: this.roundMetricValue(
                      aggregated?.batteryDischargeKwh || 0,
                    ),
                  }
                : null,
            mappings: {
              monthly_inverter_output_kwh:
                sourceMode === 'MONTHLY_FROM_DAILY'
                  ? this.buildAggregatedDebugValue(
                      'daily_inverter_output_kwh',
                      aggregated?.dailyInverterOutputKwh || 0,
                      monthlyInverterOutputKwh,
                    )
                  : this.buildScaledDebugValue(
                      'eInvDay',
                      providerRaw,
                      monthlyInverterOutputKwh,
                    ),
              monthly_to_user_kwh:
                sourceMode === 'MONTHLY_FROM_DAILY'
                  ? this.buildAggregatedDebugValue(
                      'daily_to_user_kwh',
                      aggregated?.dailyToUserKwh || 0,
                      monthlyToUserKwh,
                    )
                  : this.buildScaledDebugValue(
                      'eToUserDay',
                      providerRaw,
                      monthlyToUserKwh,
                    ),
              monthly_consumption_kwh:
                sourceMode === 'MONTHLY_FROM_DAILY'
                  ? this.buildAggregatedDebugValue(
                      'daily_consumption_kwh',
                      aggregated?.dailyConsumptionKwh || 0,
                      monthlyConsumptionKwh,
                    )
                  : this.buildScaledDebugValue(
                      'eConsumptionDay',
                      providerRaw,
                      monthlyConsumptionKwh,
                    ),
              monthly_pv_kwh:
                sourceMode === 'MONTHLY_FROM_DAILY'
                  ? this.buildAggregatedDebugValue(
                      'daily_pv_kwh',
                      aggregated?.dailyPvKwh || 0,
                      monthlyPvKwh,
                    )
                  : this.buildScaledDebugValue(
                      ['ePv1Day', 'ePv2Day', 'ePv3Day'],
                      providerRaw,
                      monthlyPvKwh,
                    ),
              grid_export_kwh:
                sourceMode === 'MONTHLY_FROM_DAILY'
                  ? this.buildAggregatedDebugValue(
                      'daily_grid_export_kwh',
                      aggregated?.gridExportKwh || 0,
                      gridExportKwh,
                    )
                  : this.buildScaledDebugValue(
                      'eToGridDay',
                      providerRaw,
                      gridExportKwh,
                    ),
            },
          },
        } satisfies NormalizedMetricDraft;
      })
      .filter((item): item is Exclude<typeof item, null> => item !== null);
  }

  private buildTotalMetric(result: LuxPowerMonitoringBundle, capturedAt: Date) {
    const raw = (result.snapshot.raw.energy || {}) as Record<string, unknown>;

    return {
      granularity: 'TOTAL' as const,
      periodKey: 'TOTAL',
      metricDate: capturedAt,
      year: capturedAt.getFullYear(),
      month: capturedAt.getMonth() + 1,
      totalPvKwh: result.snapshot.totalGenerationKwh,
      gridExportKwh: result.snapshot.totalExportKwh,
      capturedAt,
      rawPayload: {
        source: 'LIFETIME_AGGREGATE',
        rawPayload: raw,
        mappings: {
          total_pv_kwh: this.buildDirectDebugValue(
            'totalYielding',
            raw,
            result.snapshot.totalGenerationKwh,
          ),
        },
      },
    } satisfies NormalizedMetricDraft;
  }

  private async persistBundleSnapshots(
    connection: LuxPowerConnectionRecord,
    result: LuxPowerMonitoringBundle,
    normalized: NormalizedBundle,
    includeNormalizedSnapshots: boolean,
  ) {
    const capturedAt = this.parseDateOrNull(result.snapshot.fetchedAt) || new Date();
    const providerPlantId = result.snapshot.plantId || connection.plantId || null;
    const providerDeviceSn = result.snapshot.serialNumber || connection.inverterSerial || null;
    const snapshots: Array<{
      snapshotType: string;
      payload: unknown;
    }> = [
      {
        snapshotType: 'AUTH',
        payload: {
          sessionMode: result.sessionMode,
          warnings: result.warnings,
        },
      },
      { snapshotType: 'PLANT_LIST', payload: result.rawPayloads.plantList },
      { snapshotType: 'PLANT_DETAIL', payload: result.plantDetail },
      { snapshotType: 'REALTIME_RUNTIME', payload: result.rawPayloads.runtime },
      { snapshotType: 'REALTIME_ENERGY', payload: result.rawPayloads.energy },
      { snapshotType: 'DAY_CHART', payload: result.rawPayloads.realtimeSeries },
      { snapshotType: 'MONTH_CHART', payload: result.rawPayloads.dailyAggregate },
      { snapshotType: 'YEAR_CHART', payload: result.rawPayloads.monthlyAggregate },
      { snapshotType: 'TOTAL_CHART', payload: result.rawPayloads.lifetimeAggregate },
    ];

    if (includeNormalizedSnapshots) {
      if (normalized.realtime) {
        snapshots.push({
          snapshotType: 'NORMALIZED_REALTIME',
          payload: normalized.realtime.rawPayload,
        });
      }
      if (normalized.daily.length) {
        snapshots.push({
          snapshotType: 'NORMALIZED_DAILY',
          payload: normalized.daily.map((item) => ({
            periodKey: item.periodKey,
            values: item.rawPayload,
          })),
        });
      }
      if (normalized.monthly.length) {
        snapshots.push({
          snapshotType: 'NORMALIZED_MONTHLY',
          payload: normalized.monthly.map((item) => ({
            periodKey: item.periodKey,
            values: item.rawPayload,
          })),
        });
      }
      if (normalized.total) {
        snapshots.push({
          snapshotType: 'NORMALIZED_TOTAL',
          payload: normalized.total.rawPayload,
        });
      }
    }

    for (const snapshot of snapshots) {
      await this.prisma.luxPowerDebugSnapshot.create({
        data: {
          connectionId: connection.id,
          solarSystemId: connection.solarSystemId || null,
          snapshotType: snapshot.snapshotType as any,
          status: 'CAPTURED',
          providerPlantId,
          providerDeviceSn,
          capturedAt,
          payload: snapshot.payload as any,
        },
      });
    }
  }

  private async upsertNormalizedMetrics(
    connection: LuxPowerConnectionRecord,
    result: LuxPowerMonitoringBundle,
    normalized: NormalizedBundle,
  ) {
    const providerPlantId = result.snapshot.plantId || connection.plantId || null;
    const providerDeviceSn = result.snapshot.serialNumber || connection.inverterSerial || null;
    const drafts = [
      normalized.realtime,
      ...normalized.daily,
      ...normalized.monthly,
      normalized.total,
    ].filter((item): item is NormalizedMetricDraft => Boolean(item));

    for (const metric of drafts) {
      await this.prisma.luxPowerNormalizedMetric.upsert({
        where: {
          connectionId_granularity_periodKey: {
            connectionId: connection.id,
            granularity: metric.granularity,
            periodKey: metric.periodKey,
          },
        },
        update: this.buildNormalizedMetricPersistence(
          metric,
          connection,
          providerPlantId,
          providerDeviceSn,
        ),
        create: {
          connectionId: connection.id,
          solarSystemId: connection.solarSystemId || null,
          provider: 'LUXPOWER',
          providerPlantId,
          providerDeviceSn,
          granularity: metric.granularity as any,
          periodKey: metric.periodKey,
          ...this.buildNormalizedMetricPersistence(
            metric,
            connection,
            providerPlantId,
            providerDeviceSn,
          ),
        },
      });
    }
  }

  private buildNormalizedMetricPersistence(
    metric: NormalizedMetricDraft,
    connection: LuxPowerConnectionRecord,
    providerPlantId: string | null,
    providerDeviceSn: string | null,
  ) {
    return {
      solarSystemId: connection.solarSystemId || null,
      provider: 'LUXPOWER',
      providerPlantId,
      providerDeviceSn,
      metricDate: metric.metricDate,
      year: metric.year,
      month: metric.month,
      pvPowerW: this.toRoundedNumber(metric.pvPowerW),
      loadPowerW: this.toRoundedNumber(metric.loadPowerW),
      gridPowerW: this.toRoundedNumber(metric.gridPowerW),
      batteryPowerW: this.toRoundedNumber(metric.batteryPowerW),
      batterySocPercent: this.toRoundedNumber(metric.batterySocPercent),
      acCouplePowerW: this.toRoundedNumber(metric.acCouplePowerW),
      currentPvPowerKw: this.toRoundedNumber(metric.currentPvPowerKw),
      currentLoadPowerKw: this.toRoundedNumber(metric.currentLoadPowerKw),
      currentBatterySoc: this.toRoundedNumber(metric.currentBatterySoc),
      dailyInverterOutputKwh: this.toRoundedNumber(metric.dailyInverterOutputKwh),
      dailyToUserKwh: this.toRoundedNumber(metric.dailyToUserKwh),
      dailyConsumptionKwh: this.toRoundedNumber(metric.dailyConsumptionKwh),
      monthlyInverterOutputKwh: this.toRoundedNumber(metric.monthlyInverterOutputKwh),
      monthlyToUserKwh: this.toRoundedNumber(metric.monthlyToUserKwh),
      monthlyConsumptionKwh: this.toRoundedNumber(metric.monthlyConsumptionKwh),
      dailyPvKwh: this.toRoundedNumber(metric.dailyPvKwh),
      monthlyPvKwh: this.toRoundedNumber(metric.monthlyPvKwh),
      totalPvKwh: this.toRoundedNumber(metric.totalPvKwh),
      gridImportKwh: this.toRoundedNumber(metric.gridImportKwh),
      gridExportKwh: this.toRoundedNumber(metric.gridExportKwh),
      capturedAt: metric.capturedAt,
      rawPayload: metric.rawPayload as any,
    };
  }

  private async syncDailyEnergyRecords(
    connection: LuxPowerConnectionRecord,
    dailyMetrics: NormalizedMetricDraft[],
  ) {
    if (!connection.solarSystemId) {
      return 0;
    }

    let synced = 0;
    for (const metric of dailyMetrics) {
      if (!metric.metricDate) {
        continue;
      }

      const solarGenerated = this.toPositiveNumber(
        metric.dailyPvKwh ?? metric.dailyInverterOutputKwh,
      );
      const loadConsumed = this.toPositiveNumber(metric.dailyConsumptionKwh);
      const gridImported = this.toPositiveNumber(metric.dailyToUserKwh);
      const gridExported = this.toPositiveNumber(metric.gridExportKwh);
      const selfConsumed = this.toPositiveNumber(solarGenerated - gridExported);

      await this.prisma.energyRecord.upsert({
        where: {
          solarSystemId_recordDate: {
            solarSystemId: connection.solarSystemId,
            recordDate: metric.metricDate,
          },
        },
        update: {
          solarGeneratedKwh: solarGenerated,
          loadConsumedKwh: loadConsumed,
          gridImportedKwh: gridImported,
          gridExportedKwh: gridExported,
          selfConsumedKwh: selfConsumed,
          savingAmount: null,
        },
        create: {
          solarSystemId: connection.solarSystemId,
          recordDate: metric.metricDate,
          solarGeneratedKwh: solarGenerated,
          loadConsumedKwh: loadConsumed,
          gridImportedKwh: gridImported,
          gridExportedKwh: gridExported,
          selfConsumedKwh: selfConsumed,
          savingAmount: null,
        },
      });
      synced += 1;
    }

    return synced;
  }

  private async syncMonthlyRecordsAndBillings(
    connection: LuxPowerConnectionRecord,
    monthlyMetrics: NormalizedMetricDraft[],
    actorId?: string,
  ) {
    if (!connection.solarSystemId) {
      return {
        monthlySynced: 0,
        billingSynced: 0,
        warnings: [] as string[],
      };
    }

    const connectionWithRelations = await this.prisma.luxPowerConnection.findFirst({
      where: { id: connection.id, deletedAt: null },
      include: this.includeRelations(),
    });

    if (!connectionWithRelations?.solarSystem) {
      return {
        monthlySynced: 0,
        billingSynced: 0,
        warnings: ['Connection chua duoc lien ket voi system trong Moka.'],
      };
    }

    const system = connectionWithRelations.solarSystem;
    const billingSource = this.getResolvedBillingSource(
      connectionWithRelations,
      connectionWithRelations.contract,
    );
    const warnings: string[] = [];
    let monthlySynced = 0;
    let billingSynced = 0;

    for (const metric of monthlyMetrics) {
      if (!metric.month || !metric.year) {
        continue;
      }

      if (this.isFutureMonthlyPeriod(metric.year, metric.month)) {
        continue;
      }

      const contract = await this.resolveContractForPeriod(
        connectionWithRelations,
        metric.month,
        metric.year,
      );
      const pricing = await this.resolvePricingDefaults(system, contract);
      const pvOutput = this.toPositiveNumber(
        metric.monthlyPvKwh ?? metric.monthlyInverterOutputKwh,
      );
      const loadConsumed = this.optionalPositiveNumber(metric.monthlyConsumptionKwh);
      const subtotalAmount = roundMoney(pvOutput * pricing.unitPrice);
      const taxAmount = calculateVatAmount(subtotalAmount, pricing.vatRate);
      const totalAmount = roundMoney(subtotalAmount + taxAmount - pricing.discountAmount);
      const stationId =
        connectionWithRelations.plantId ||
        system.stationId ||
        connectionWithRelations.id;
      const billingMetricValue = this.extractBillingMetricValue(metric, billingSource);
      const billedPvGenerationKwh = this.toBilledPvGenerationKwh(metric, billingSource);
      const luxPowerDiscountAmount = this.resolveLuxPowerDiscountAmount(system);

      await this.prisma.monthlyEnergyRecord.upsert({
        where: {
          source_stationId_year_month: {
            source: 'LUXPOWER_MONTHLY',
            stationId,
            year: metric.year,
            month: metric.month,
          },
        },
        update: {
          solarSystemId: system.id,
          customerId: system.customerId || null,
          stationId,
          year: metric.year,
          month: metric.month,
          pvGenerationKwh: pvOutput,
          loadConsumedKwh: loadConsumed,
          unitPrice: pricing.unitPrice,
          subtotalAmount,
          vatRate: pricing.vatRate,
          taxAmount,
          discountAmount: pricing.discountAmount,
          totalAmount,
          source: 'LUXPOWER_MONTHLY',
          syncTime: new Date(),
          rawPayload: {
            normalizedMetric: metric.rawPayload,
            billingSource,
            billingMetricValue,
          } as any,
          note: this.buildBillingNote(metric.month, metric.year, billingSource),
          deletedAt: null,
        },
        create: {
          solarSystemId: system.id,
          customerId: system.customerId || null,
          stationId,
          year: metric.year,
          month: metric.month,
          pvGenerationKwh: pvOutput,
          loadConsumedKwh: loadConsumed,
          unitPrice: pricing.unitPrice,
          subtotalAmount,
          vatRate: pricing.vatRate,
          taxAmount,
          discountAmount: pricing.discountAmount,
          totalAmount,
          source: 'LUXPOWER_MONTHLY',
          syncTime: new Date(),
          rawPayload: {
            normalizedMetric: metric.rawPayload,
            billingSource,
            billingMetricValue,
          } as any,
          note: this.buildBillingNote(metric.month, metric.year, billingSource),
        },
      });
      monthlySynced += 1;

      if (!contract?.id) {
        warnings.push(
          `Thang ${metric.month}/${metric.year}: chua co linked contract, bo qua sync billing.`,
        );
        continue;
      }

      if (!billingSource) {
        warnings.push(
          `Thang ${metric.month}/${metric.year}: chua chon billing source hop le cho LuxPower.`,
        );
        continue;
      }

      if (!billingMetricValue || billingMetricValue <= 0 || !billedPvGenerationKwh) {
        warnings.push(
          `Thang ${metric.month}/${metric.year}: billing source ${this.getBillingSourceLabel(
            billingSource,
          )} khong co du lieu hop le.`,
        );
        continue;
      }

      try {
        await this.monthlyPvBillingsService.sync(
          system.id,
          {
            month: metric.month,
            year: metric.year,
            contractId: contract.id,
            pvGenerationKwh: billedPvGenerationKwh,
            unitPrice: pricing.unitPrice,
            vatRate: pricing.vatRate,
            discountAmount: luxPowerDiscountAmount,
            source: `LUXPOWER_${billingSource}`,
            note: this.buildBillingNote(metric.month, metric.year, billingSource),
          },
          actorId,
        );
        billingSynced += 1;
      } catch (error) {
        warnings.push(
          `Thang ${metric.month}/${metric.year}: ${this.formatErrorMessage(
            error,
            'Khong the sync monthly billing tu LuxPower.',
          )}`,
        );
      }
    }

    return {
      monthlySynced,
      billingSynced,
      warnings,
    };
  }

  private async resolveLinkageContext(
    dto: Partial<CreateLuxPowerConnectionDto & UpdateLuxPowerConnectionDto>,
    existing?: LuxPowerConnectionRecord | null,
  ): Promise<LinkageContext> {
    let customerId =
      dto.customerId !== undefined ? dto.customerId?.trim() || null : existing?.customerId || null;
    let solarSystemId =
      dto.solarSystemId !== undefined
        ? dto.solarSystemId?.trim() || null
        : existing?.solarSystemId || null;
    let contractId =
      dto.contractId !== undefined ? dto.contractId?.trim() || null : existing?.contractId || null;
    let billingRuleLabel =
      dto.billingRuleLabel !== undefined
        ? dto.billingRuleLabel?.trim() || null
        : existing?.billingRuleLabel || null;

    let contract = contractId
      ? await this.prisma.contract.findFirst({
          where: { id: contractId, deletedAt: null },
          include: {
            servicePackage: true,
          },
        })
      : null;

    if (contractId && !contract) {
      throw new BadRequestException('Khong tim thay contract de lien ket LuxPower.');
    }

    if (contract) {
      customerId = customerId || contract.customerId;
      solarSystemId = solarSystemId || contract.solarSystemId;
      billingRuleLabel =
        billingRuleLabel || this.normalizeBillingMetricSource(contract.servicePackage?.billingRule);
    }

    const solarSystem = solarSystemId
      ? await this.prisma.solarSystem.findFirst({
          where: { id: solarSystemId, deletedAt: null },
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        })
      : null;

    if (solarSystemId && !solarSystem) {
      throw new BadRequestException('Khong tim thay he thong de lien ket LuxPower.');
    }

    if (solarSystem?.customerId) {
      customerId = customerId || solarSystem.customerId;
    }

    let customer = customerId
      ? await this.prisma.customer.findFirst({
          where: { id: customerId, deletedAt: null },
          include: {
            user: true,
          },
        })
      : null;

    if (customerId && !customer) {
      throw new BadRequestException('Khong tim thay khach hang de lien ket LuxPower.');
    }

    if (solarSystem?.customerId && customerId && solarSystem.customerId !== customerId) {
      throw new BadRequestException(
        'He thong duoc chon khong thuoc customer da lien ket voi LuxPower.',
      );
    }

    if (contract?.customerId && customerId && contract.customerId !== customerId) {
      throw new BadRequestException('Contract duoc chon khong thuoc customer hien tai.');
    }

    if (contract?.solarSystemId && solarSystemId && contract.solarSystemId !== solarSystemId) {
      throw new BadRequestException('Contract duoc chon khong thuoc system hien tai.');
    }

    if (!customer && solarSystem?.customer) {
      customer = solarSystem.customer;
    }

    return {
      customerId,
      solarSystemId,
      contractId: contract?.id || contractId,
      billingRuleLabel,
      customer,
      solarSystem,
      contract,
    };
  }

  private getResolvedBillingSource(
    connection: Partial<LuxPowerConnectionRecord>,
    contract?: any,
  ): BillingMetricSource | null {
    const contractRule =
      this.normalizeBillingMetricSource(contract?.billingRuleLabel) ||
      this.normalizeBillingMetricSource(contract?.servicePackage?.billingRule);
    const connectionRule = this.normalizeBillingMetricSource(connection.billingRuleLabel);

    return contractRule || connectionRule || null;
  }

  private normalizeBillingMetricSource(value?: string | null): BillingMetricSource | null {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    if (!normalized) {
      return null;
    }

    if (normalized.includes('EINVDAY')) {
      return 'E_INV_DAY';
    }

    if (
      normalized.includes('PVMONTHLYGENERATION') ||
      normalized.includes('PVMONTHLY') ||
      normalized.includes('MONTHLYPV') ||
      normalized.includes('PVGENERATION')
    ) {
      return 'PV_MONTHLY_GENERATION';
    }

    if (normalized.includes('ETOUSERDAY')) {
      return 'E_TO_USER_DAY';
    }

    if (normalized.includes('ECONSUMPTIONDAY')) {
      return 'E_CONSUMPTION_DAY';
    }

    return null;
  }

  private getBillingSourceLabel(source?: BillingMetricSource | null) {
    const match = BILLING_SOURCE_OPTIONS.find((item) => item.value === source);
    return match?.label || null;
  }

  private extractBillingMetricValue(
    metric: Partial<NormalizedMetricDraft> | Record<string, unknown> | null,
    source: BillingMetricSource | null,
  ) {
    if (!metric || !source) {
      return null;
    }

    switch (source) {
      case 'PV_MONTHLY_GENERATION':
        return this.toNullableNumber((metric as any).monthlyPvKwh);
      case 'E_INV_DAY':
        return this.toNullableNumber((metric as any).monthlyInverterOutputKwh);
      case 'E_TO_USER_DAY':
        return this.toNullableNumber((metric as any).monthlyToUserKwh);
      case 'E_CONSUMPTION_DAY':
        return this.toNullableNumber((metric as any).monthlyConsumptionKwh);
      default:
        return null;
    }
  }

  private hasAvailableMetrics(result: LuxPowerMonitoringBundle, normalized: NormalizedBundle) {
    return Boolean(
      result.snapshot.pvPowerW !== null ||
        normalized.daily.length ||
        normalized.monthly.length ||
        normalized.total?.totalPvKwh,
    );
  }

  private computePlantLinkedAt(
    connection: Partial<LuxPowerConnectionRecord>,
    result: LuxPowerMonitoringBundle,
  ) {
    if (
      connection.customerId &&
      connection.solarSystemId &&
      (result.snapshot.plantId || connection.plantId)
    ) {
      return connection.plantLinkedAt || new Date();
    }

    return null;
  }

  private computeBillingReadyAt(
    connection: Partial<LuxPowerConnectionRecord>,
    normalized: NormalizedBundle,
    billingSyncSucceeded: boolean,
  ) {
    const billingSource = this.getResolvedBillingSource(connection);
    const hasMonthlyMetrics = normalized.monthly.some(
      (item) => this.extractBillingMetricValue(item, billingSource) !== null,
    );

    if (connection.contractId && billingSource && hasMonthlyMetrics && billingSyncSucceeded) {
      return connection.billingReadyAt || new Date();
    }

    return null;
  }

  private async resolveContractForPeriod(
    connection: LuxPowerConnectionRecord,
    month: number | null,
    year: number | null,
  ) {
    if (connection.contractId) {
      return this.prisma.contract.findFirst({
        where: {
          id: connection.contractId,
          deletedAt: null,
        },
        include: {
          servicePackage: true,
        },
      });
    }

    if (!connection.solarSystemId || !month || !year) {
      return null;
    }

    const rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    return this.prisma.contract.findFirst({
      where: {
        solarSystemId: connection.solarSystemId,
        status: 'ACTIVE',
        deletedAt: null,
        startDate: { lte: rangeEnd },
        OR: [{ endDate: null }, { endDate: { gte: rangeStart } }],
      },
      include: {
        servicePackage: true,
      },
      orderBy: [{ startDate: 'desc' }],
    });
  }

  private async resolvePricingDefaults(system: SolarSystemRecord, contract: any | null) {
    return {
      unitPrice: roundMoney(
        toNumber(system.defaultUnitPrice) ||
          toNumber(system.customer?.defaultUnitPrice) ||
          toNumber(contract?.pricePerKwh) ||
          toNumber(contract?.servicePackage?.pricePerKwh) ||
          MOKA_DEFAULT_PPA_UNIT_PRICE,
      ),
      vatRate: normalizePercentRate(
        toNumber(system.defaultVatRate) ??
          toNumber(system.customer?.defaultVatRate) ??
          toNumber(contract?.vatRate) ??
          toNumber(contract?.servicePackage?.vatRate) ??
          deriveVatRateFromAmounts(100, toNumber(system.defaultTaxAmount), NaN) ??
          deriveVatRateFromAmounts(100, toNumber(system.customer?.defaultTaxAmount), NaN) ??
          MOKA_DEFAULT_VAT_RATE,
        MOKA_DEFAULT_VAT_RATE,
      ),
      discountAmount: roundMoney(
        toNumber(system.defaultDiscountAmount) ||
          toNumber(system.customer?.defaultDiscountAmount) ||
          MOKA_DEFAULT_DISCOUNT_AMOUNT,
      ),
    };
  }

  private async buildMonthlyBillingPreview(
    connection: LuxPowerConnectionRecord,
    monthlyMetrics: NormalizedMetricDraft[],
  ) {
    const rows: LuxPowerMonthlyPreviewRow[] = [];
    const connectionWithRelations =
      connection.contract && connection.solarSystem
        ? connection
        : await this.getConnectionOrThrow(connection.id);
    const system = connectionWithRelations.solarSystem || null;
    const billingSource = this.getResolvedBillingSource(
      connectionWithRelations,
      connectionWithRelations.contract,
    );

    for (const metric of [...monthlyMetrics]
      .filter(
        (item) =>
          item.year &&
          item.month &&
          !this.isFutureMonthlyPeriod(item.year, item.month),
      )
      .sort((left, right) => right.periodKey.localeCompare(left.periodKey))
      .slice(0, 12)) {
      const reasons: string[] = [];
      const contract = await this.resolveContractForPeriod(
        connectionWithRelations,
        metric.month || null,
        metric.year || null,
      );
      const pricing = system ? await this.resolvePricingDefaults(system, contract) : null;
      const sourceValueKwh = this.extractBillingMetricValue(metric, billingSource);
      const billedPvTotalKwh = this.toBilledPvGenerationKwh(metric, billingSource);
      const pvGenerationKwh =
        this.toNullableNumber(metric.monthlyPvKwh) ??
        this.toNullableNumber(metric.monthlyInverterOutputKwh);
      const loadConsumptionKwh = this.toNullableNumber(metric.monthlyConsumptionKwh);
      const gridImportKwh = this.toNullableNumber(metric.gridImportKwh);
      const gridExportKwh = this.toNullableNumber(metric.gridExportKwh);
      const batteryChargeKwh = this.toMonthlyDerivedNumber(metric, 'battery_charge_kwh');
      const batteryDischargeKwh = this.toMonthlyDerivedNumber(metric, 'battery_discharge_kwh');

      if (!contract?.id) {
        reasons.push('Chưa có contract liên kết cho kỳ này.');
      }
      if (!billingSource) {
        reasons.push('Chưa chọn billing source hợp lệ.');
      }
      if (!metric.month || !metric.year) {
        reasons.push('Thiếu kỳ tháng hợp lệ.');
      }
      if (sourceValueKwh === null) {
        reasons.push('Billing source chưa có dữ liệu normalized.');
      } else if (sourceValueKwh <= 0) {
        reasons.push('Billing source đang bằng 0 nên chưa thể tính bill.');
      }
      if (!system?.id) {
        reasons.push('Connection chưa linked với hệ thống Moka.');
      }

      const luxPowerDiscountAmount = system ? this.resolveLuxPowerDiscountAmount(system) : 0;
      const subtotalAmount =
        pricing && billedPvTotalKwh && billedPvTotalKwh > 0
          ? roundMoney(billedPvTotalKwh * pricing.unitPrice)
          : null;
      const taxAmount =
        subtotalAmount !== null && pricing
          ? calculateVatAmount(subtotalAmount, pricing.vatRate)
          : null;
      const totalAmount =
        subtotalAmount !== null && taxAmount !== null && pricing
          ? roundMoney(subtotalAmount + taxAmount - luxPowerDiscountAmount)
          : null;

      rows.push({
        periodKey: metric.periodKey,
        year: metric.year!,
        month: metric.month!,
        sourceMode:
          String((metric.rawPayload as any)?.source || '') === 'MONTHLY_FROM_DAILY'
            ? 'AGGREGATED_DAILY'
            : 'PROVIDER_MONTHLY',
        contractId: contract?.id || null,
        contractNumber: contract?.contractNumber || null,
        billingSource,
        billingSourceLabel: billingSource ? this.getBillingSourceLabel(billingSource) : null,
        sourceValueKwh,
        billedPvTotalKwh,
        pvGenerationKwh,
        loadConsumptionKwh,
        gridImportKwh,
        gridExportKwh,
        batteryChargeKwh,
        batteryDischargeKwh,
        unitPrice: pricing?.unitPrice || null,
        subtotalAmount,
        taxAmount,
        totalAmount,
        ready: reasons.length === 0,
        reasons,
        metric: this.serializeNormalizedMetric(metric, true),
      });
    }

    return {
      billingSource,
      billingSourceLabel: billingSource ? this.getBillingSourceLabel(billingSource) : null,
      latestReadyMonth: rows.find((item) => item.ready)?.periodKey || null,
      rows,
      auditRows: this.buildBillingAuditRows(monthlyMetrics, billingSource),
    };
  }

  private buildBillingNote(
    month: number,
    year: number,
    billingSource: BillingMetricSource | null,
  ) {
    const label = billingSource ? this.getBillingSourceLabel(billingSource) : 'chua chon';
    return `LuxPower monthly aggregate ${month}/${year}. Billing source: ${label}.`;
  }

  private deriveGridImportKwh(
    consumptionKwh: number | null | undefined,
    toUserKwh: number | null | undefined,
    batteryDischargeKwh: number | null | undefined,
  ) {
    const consumption = this.toNullableNumber(consumptionKwh);
    const toUser = this.toNullableNumber(toUserKwh);
    const batteryDischarge = this.toNullableNumber(batteryDischargeKwh);

    if (consumption === null && toUser === null) {
      return null;
    }

    const normalized = Math.max(
      0,
      (consumption || 0) - (toUser || 0) - Math.max(0, batteryDischarge || 0),
    );

    return this.roundMetricValue(normalized);
  }

  private isFutureMonthlyPeriod(year: number | null | undefined, month: number | null | undefined) {
    if (!year || !month) {
      return false;
    }

    const now = new Date();
    const currentPeriod = now.getFullYear() * 100 + (now.getMonth() + 1);
    const targetPeriod = year * 100 + month;

    return targetPeriod > currentPeriod;
  }

  private toDailyDerivedNumber(metric: NormalizedMetricDraft, key: string) {
    const payload =
      metric.rawPayload && typeof metric.rawPayload === 'object' && !Array.isArray(metric.rawPayload)
        ? (metric.rawPayload as Record<string, any>)
        : null;
    const derived =
      payload?.derived && typeof payload.derived === 'object' && !Array.isArray(payload.derived)
        ? (payload.derived as Record<string, unknown>)
        : null;
    return this.toNullableNumber(derived?.[key]);
  }

  private toMonthlyDerivedNumber(metric: NormalizedMetricDraft, key: string) {
    const payload =
      metric.rawPayload && typeof metric.rawPayload === 'object' && !Array.isArray(metric.rawPayload)
        ? (metric.rawPayload as Record<string, any>)
        : null;
    const aggregatedDaily =
      payload?.aggregatedDaily &&
      typeof payload.aggregatedDaily === 'object' &&
      !Array.isArray(payload.aggregatedDaily)
        ? (payload.aggregatedDaily as Record<string, unknown>)
        : null;
    return this.toNullableNumber(aggregatedDaily?.[key]);
  }

  private getMetricDebugMapping(metric: NormalizedMetricDraft, key: string) {
    const payload =
      metric.rawPayload && typeof metric.rawPayload === 'object' && !Array.isArray(metric.rawPayload)
        ? (metric.rawPayload as Record<string, any>)
        : null;
    const mappings =
      payload?.mappings && typeof payload.mappings === 'object' && !Array.isArray(payload.mappings)
        ? (payload.mappings as Record<string, unknown>)
        : null;

    if (!mappings?.[key] || typeof mappings[key] !== 'object' || Array.isArray(mappings[key])) {
      return null;
    }

    return mappings[key] as Record<string, unknown>;
  }

  private sumMetricRawValue(value: unknown): number | null {
    if (Array.isArray(value)) {
      const numbers = value
        .map((item) => this.toNullableNumber(item))
        .filter((item): item is number => item !== null);
      return numbers.length ? this.roundMetricValue(numbers.reduce((sum, item) => sum + item, 0)) : null;
    }

    return this.toNullableNumber(value);
  }

  private computeMissingDaysForMonth(metric: NormalizedMetricDraft) {
    const payload =
      metric.rawPayload && typeof metric.rawPayload === 'object' && !Array.isArray(metric.rawPayload)
        ? (metric.rawPayload as Record<string, any>)
        : null;
    const aggregatedDaily =
      payload?.aggregatedDaily &&
      typeof payload.aggregatedDaily === 'object' &&
      !Array.isArray(payload.aggregatedDaily)
        ? (payload.aggregatedDaily as Record<string, unknown>)
        : null;
    const periodKeys = Array.isArray(aggregatedDaily?.periodKeys)
      ? (aggregatedDaily.periodKeys as string[])
      : [];

    if (!metric.year || !metric.month || !periodKeys.length) {
      return [];
    }

    const seenDays = new Set<number>();
    for (const periodKey of periodKeys) {
      const day = Number(String(periodKey).split('-')[2]);
      if (Number.isFinite(day)) {
        seenDays.add(day);
      }
    }

    const totalDays = new Date(metric.year, metric.month, 0).getDate();
    const missing: number[] = [];
    for (let day = 1; day <= totalDays; day += 1) {
      if (!seenDays.has(day)) {
        missing.push(day);
      }
    }

    return missing;
  }

  private computeDayCountForMonth(metric: NormalizedMetricDraft) {
    const payload =
      metric.rawPayload && typeof metric.rawPayload === 'object' && !Array.isArray(metric.rawPayload)
        ? (metric.rawPayload as Record<string, any>)
        : null;
    const aggregatedDaily =
      payload?.aggregatedDaily &&
      typeof payload.aggregatedDaily === 'object' &&
      !Array.isArray(payload.aggregatedDaily)
        ? (payload.aggregatedDaily as Record<string, unknown>)
        : null;

    return this.toNullableNumber(aggregatedDaily?.pointCount) ?? 0;
  }

  private buildBillingAuditRows(
    monthlyMetrics: NormalizedMetricDraft[],
    billingSource: BillingMetricSource | null,
  ): LuxPowerBillingAuditRow[] {
    return [...monthlyMetrics]
      .filter(
        (item) =>
          item.year &&
          item.month &&
          !this.isFutureMonthlyPeriod(item.year, item.month),
      )
      .sort((left, right) => right.periodKey.localeCompare(left.periodKey))
      .slice(0, 12)
      .map((metric) => {
        const mapping = this.getMetricDebugMapping(metric, 'monthly_pv_kwh');

        return {
          periodKey: metric.periodKey,
          year: metric.year!,
          month: metric.month!,
          rawPvTotal: this.sumMetricRawValue(mapping?.raw_value),
          normalizedPvTotal: this.toNullableNumber(metric.monthlyPvKwh),
          billedPvTotal: this.toBilledPvGenerationKwh(metric, billingSource),
          sourceValueKwh: this.extractBillingMetricValue(metric, billingSource),
          billingSource,
          billingSourceLabel: billingSource ? this.getBillingSourceLabel(billingSource) : null,
          missingDays: this.computeMissingDaysForMonth(metric),
          dayCount: this.computeDayCountForMonth(metric),
        };
      });
  }

  private toBilledPvGenerationKwh(
    metric: Partial<NormalizedMetricDraft> | Record<string, unknown> | null,
    source: BillingMetricSource | null,
  ) {
    const value = this.extractBillingMetricValue(metric, source);
    if (value === null) {
      return null;
    }

    if (source === 'PV_MONTHLY_GENERATION') {
      return Math.max(0, Math.round(value));
    }

    return this.toPositiveNumber(value);
  }

  private resolveLuxPowerDiscountAmount(system: SolarSystemRecord | null | undefined) {
    if (!system) {
      return 0;
    }

    const systemDiscount = toNumber(system.defaultDiscountAmount);
    return systemDiscount > 0 ? roundMoney(systemDiscount) : 0;
  }

  private roundMetricValue(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return null;
    }

    return Number(Number(value).toFixed(2));
  }

  private buildScaledDebugValue(
    rawField: string | string[],
    raw: Record<string, unknown>,
    normalizedValue: number | null | undefined,
  ) {
    if (Array.isArray(rawField)) {
      return {
        raw_field: rawField,
        raw_value: rawField.map((field) => this.toNullableNumber(raw[field])),
        scale_factor: 0.1,
        normalized_value: this.toNullableNumber(normalizedValue),
      };
    }

    return {
      raw_field: rawField,
      raw_value: this.toNullableNumber(raw[rawField]),
      scale_factor: 0.1,
      normalized_value: this.toNullableNumber(normalizedValue),
    };
  }

  private buildAggregatedDebugValue(
    sourceField: string,
    pointCount: number,
    normalizedValue: number | null | undefined,
  ) {
    return {
      raw_field: sourceField,
      raw_value: pointCount,
      scale_factor: 1,
      normalized_value: this.toNullableNumber(normalizedValue),
      aggregation: 'sum',
    };
  }

  private buildDirectDebugValue(
    rawField: string,
    raw: Record<string, unknown>,
    normalizedValue: number | null | undefined,
  ) {
    return {
      raw_field: rawField,
      raw_value: this.toNullableNumber(raw[rawField]),
      scale_factor: 1,
      normalized_value: this.toNullableNumber(normalizedValue),
    };
  }

  private serializeDebugSnapshot(snapshot: any, includePayload = true) {
    return {
      ...snapshot,
      payload: includePayload ? snapshot.payload : null,
      capturedAt: snapshot.capturedAt?.toISOString?.() || snapshot.capturedAt,
      createdAt: snapshot.createdAt?.toISOString?.() || snapshot.createdAt,
      updatedAt: snapshot.updatedAt?.toISOString?.() || snapshot.updatedAt,
    };
  }

  private serializeNormalizedMetric(metric: any, includeRawPayload = true) {
    return {
      ...metric,
      rawPayload: includeRawPayload ? metric.rawPayload : null,
      pvPowerW: this.toNullableNumber(metric.pvPowerW),
      loadPowerW: this.toNullableNumber(metric.loadPowerW),
      gridPowerW: this.toNullableNumber(metric.gridPowerW),
      batteryPowerW: this.toNullableNumber(metric.batteryPowerW),
      batterySocPercent: this.toNullableNumber(metric.batterySocPercent),
      acCouplePowerW: this.toNullableNumber(metric.acCouplePowerW),
      currentPvPowerKw: this.toNullableNumber(metric.currentPvPowerKw),
      currentLoadPowerKw: this.toNullableNumber(metric.currentLoadPowerKw),
      currentBatterySoc: this.toNullableNumber(metric.currentBatterySoc),
      dailyInverterOutputKwh: this.toNullableNumber(metric.dailyInverterOutputKwh),
      dailyToUserKwh: this.toNullableNumber(metric.dailyToUserKwh),
      dailyConsumptionKwh: this.toNullableNumber(metric.dailyConsumptionKwh),
      monthlyInverterOutputKwh: this.toNullableNumber(metric.monthlyInverterOutputKwh),
      monthlyToUserKwh: this.toNullableNumber(metric.monthlyToUserKwh),
      monthlyConsumptionKwh: this.toNullableNumber(metric.monthlyConsumptionKwh),
      dailyPvKwh: this.toNullableNumber(metric.dailyPvKwh),
      monthlyPvKwh: this.toNullableNumber(metric.monthlyPvKwh),
      totalPvKwh: this.toNullableNumber(metric.totalPvKwh),
      gridImportKwh: this.toNullableNumber(metric.gridImportKwh),
      gridExportKwh: this.toNullableNumber(metric.gridExportKwh),
      metricDate: metric.metricDate?.toISOString?.() || metric.metricDate || null,
      capturedAt: metric.capturedAt?.toISOString?.() || metric.capturedAt,
      createdAt: metric.createdAt?.toISOString?.() || metric.createdAt,
      updatedAt: metric.updatedAt?.toISOString?.() || metric.updatedAt,
    };
  }

  private serializeConnection(
    connection: LuxPowerConnectionRecord,
    canViewSecrets = false,
    canViewDebug = false,
  ) {
    const { passwordEncrypted, ...safeConnection } = connection;
    const logs = Array.isArray(connection.syncLogs) ? connection.syncLogs : [];
    const lastTest = logs.find((log: any) => log.action === 'TEST_CONNECTION') || null;
    const lastSync =
      logs.find((log: any) =>
        ['MANUAL_SYNC', 'SCHEDULED_SYNC'].includes(log.action),
      ) || null;
    const lastFailure =
      logs.find((log: any) => ['ERROR', 'WARNING'].includes(log.status)) || null;
    const billingSource = this.getResolvedBillingSource(connection, connection.contract);
    const monthlyMetric = Array.isArray(connection.normalizedMetrics)
      ? [...connection.normalizedMetrics]
          .filter(
            (metric: any) =>
              metric.granularity === 'MONTHLY' &&
              !this.isFutureMonthlyPeriod(metric.year, metric.month),
          )
          .sort((left: any, right: any) => right.periodKey.localeCompare(left.periodKey))[0] ||
        null
      : null;
    const missingData: string[] = [];

    if (!connection.authReadyAt) {
      missingData.push('Chua co session LuxPower hop le.');
    }
    if (!connection.customerId || !connection.solarSystemId) {
      missingData.push('Plant chua link day du voi customer va system.');
    }
    if (!connection.metricsAvailableAt) {
      missingData.push('Chua co normalized metrics.');
    }
    if (!connection.contractId) {
      missingData.push('Chua link contract de tinh billing.');
    }
    if (!billingSource) {
      missingData.push('Chua chon billing source cho LuxPower.');
    }
    if (!monthlyMetric) {
      missingData.push('Chua co monthly aggregate normalized.');
    } else if ((this.extractBillingMetricValue(this.serializeNormalizedMetric(monthlyMetric), billingSource) || 0) <= 0) {
      missingData.push('Billing source hien tai chua co gia tri kWh hop le.');
    }

    return {
      ...safeConnection,
      username: canViewSecrets ? safeConnection.username : null,
      lastProviderResponse: this.sanitizeProviderResponse(
        safeConnection.lastProviderResponse,
        canViewDebug,
      ),
      hasStoredPassword: Boolean(passwordEncrypted),
      customer: connection.customer
        ? {
            id: connection.customer.id,
            customerCode: connection.customer.customerCode,
            companyName: connection.customer.companyName,
            user: connection.customer.user
              ? {
                  id: connection.customer.user.id,
                  fullName: connection.customer.user.fullName,
                  email: connection.customer.user.email,
                }
              : null,
          }
        : null,
      contract: connection.contract
        ? {
            id: connection.contract.id,
            contractNumber: connection.contract.contractNumber,
            status: connection.contract.status,
            type: connection.contract.type,
            pricePerKwh: this.toNullableNumber(connection.contract.pricePerKwh),
            vatRate: this.toNullableNumber(connection.contract.vatRate),
            servicePackage: connection.contract.servicePackage
              ? {
                  id: connection.contract.servicePackage.id,
                  name: connection.contract.servicePackage.name,
                  billingRule: connection.contract.servicePackage.billingRule,
                }
              : null,
          }
        : null,
      debugSnapshots: Array.isArray(connection.debugSnapshots)
        ? connection.debugSnapshots.map((item: any) =>
            this.serializeDebugSnapshot(item, canViewDebug),
          )
        : [],
      normalizedMetrics: Array.isArray(connection.normalizedMetrics)
        ? connection.normalizedMetrics.map((item: any) =>
            this.serializeNormalizedMetric(item, canViewDebug),
          )
        : [],
      statusSummary: {
        configured: Boolean(connection.useDemoMode || (connection.username && passwordEncrypted)),
        linkedSystem: Boolean(connection.solarSystemId),
        linkedCustomer: Boolean(connection.customerId),
        linkedContract: Boolean(connection.contractId),
        mode: connection.useDemoMode ? 'DEMO' : 'LOGIN',
        authReady: Boolean(connection.authReadyAt),
        plantLinked: Boolean(connection.plantLinkedAt),
        metricsAvailable: Boolean(connection.metricsAvailableAt),
        billingReady: Boolean(connection.billingReadyAt),
        billingSource,
        billingSourceLabel: billingSource ? this.getBillingSourceLabel(billingSource) : null,
        billingSourceValue: monthlyMetric
          ? this.extractBillingMetricValue(
              this.serializeNormalizedMetric(monthlyMetric),
              billingSource,
            )
          : null,
        lastTestStatus: lastTest?.status || null,
        lastTestMessage: lastTest?.message || null,
        lastTestAt:
          lastTest?.finishedAt?.toISOString?.() ||
          lastTest?.startedAt?.toISOString?.() ||
          null,
        lastSyncStatus: lastSync?.status || null,
        lastSyncMessage: lastSync?.message || null,
        lastSyncAt:
          lastSync?.finishedAt?.toISOString?.() ||
          lastSync?.startedAt?.toISOString?.() ||
          connection.lastSyncTime?.toISOString?.() ||
          null,
        lastSuccessfulSyncAt: connection.lastSyncTime?.toISOString?.() || null,
        lastFailureMessage: lastFailure?.message || connection.lastError || null,
        latestMonthlyMetricPeriod: monthlyMetric?.periodKey || null,
        latestMonthlyMetricSource:
          typeof monthlyMetric?.rawPayload === 'object' && monthlyMetric?.rawPayload
            ? ((monthlyMetric.rawPayload as any).source || null)
            : null,
        latestMonthlyPvKwh: monthlyMetric
          ? this.toNullableNumber(
              monthlyMetric.monthlyPvKwh ?? monthlyMetric.monthlyInverterOutputKwh,
            )
          : null,
        missingData,
      },
      solarSystem: connection.solarSystem ? this.serializeSystem(connection.solarSystem) : null,
    };
  }

  private sanitizeProviderResponse(payload: any, includeDebugPayload = false) {
    if (!payload || typeof payload !== 'object') {
      return payload ?? null;
    }

    if (includeDebugPayload) {
      return payload;
    }

    try {
      const clone = JSON.parse(JSON.stringify(payload));

      if (clone.snapshot && typeof clone.snapshot === 'object') {
        delete clone.snapshot.raw;
      }

      delete clone.raw;
      delete clone.dailyAggregatePoints;
      delete clone.monthlyAggregatePoints;
      delete clone.lifetimeAggregatePoints;
      delete clone.debug;

      return clone;
    } catch {
      return null;
    }
  }

  private serializeSystem(system: SolarSystemRecord) {
    if (!system) {
      return null;
    }

    return {
      ...system,
      capacityKwp: this.toNullableNumber(system.capacityKwp),
      installedCapacityKwp: this.toNullableNumber(system.installedCapacityKwp),
      totalGenerationKwh: this.toNullableNumber(system.totalGenerationKwh),
      currentGenerationPowerKw: this.toNullableNumber(system.currentGenerationPowerKw),
      currentMonthGenerationKwh: this.toNullableNumber(system.currentMonthGenerationKwh),
      currentYearGenerationKwh: this.toNullableNumber(system.currentYearGenerationKwh),
    };
  }

  private includeRelations() {
    return {
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
      solarSystem: {
        include: {
          customer: {
            include: {
              user: true,
            },
          },
        },
      },
      debugSnapshots: {
        orderBy: { capturedAt: 'desc' as const },
        take: 12,
      },
      normalizedMetrics: {
        orderBy: [{ capturedAt: 'desc' as const }, { periodKey: 'desc' as const }],
        take: 500,
      },
      syncLogs: {
        orderBy: { createdAt: 'desc' as const },
        take: 16,
      },
    };
  }

  private async resolveLuxPowerSystemBinding(
    systemId: string,
    desiredStationId: string | null,
    currentSourceSystem: string | null,
    currentStationId: string | null,
  ) {
    if (!desiredStationId) {
      return {
        sourceSystem: currentSourceSystem,
        stationId: currentStationId,
        warnings: ['LuxPower sync khong tim thay plant ID de gan vao system.'],
      };
    }

    const conflict = await this.prisma.solarSystem.findFirst({
      where: {
        deletedAt: null,
        sourceSystem: 'LUXPOWER',
        stationId: desiredStationId,
        NOT: {
          id: systemId,
        },
      },
      select: {
        id: true,
        name: true,
        systemCode: true,
      },
    });

    if (!conflict) {
      return {
        sourceSystem: 'LUXPOWER' as string | null,
        stationId: desiredStationId,
        warnings: [] as string[],
      };
    }

    return {
      sourceSystem: currentSourceSystem,
      stationId: currentStationId,
      warnings: [
        `Plant ${desiredStationId} da dang duoc gan voi system ${conflict.name || conflict.systemCode || conflict.id}. Sync van tiep tuc, nhung binding sourceSystem/stationId tren system hien tai tam thoi khong duoc ghi de tranh xung dot.`,
      ],
    };
  }

  private toClientConfig(connection: LuxPowerConnectionRecord): LuxPowerConnectionConfig {
    return {
      id: connection.id,
      username: connection.username,
      password: connection.passwordEncrypted
        ? decryptSecret(connection.passwordEncrypted, this.getEncryptionSecret())
        : null,
      plantId: connection.plantId,
      inverterSerial: connection.inverterSerial,
      useDemoMode: connection.useDemoMode,
    };
  }

  private assertCredentialMode(
    useDemoMode: boolean | undefined,
    username: string | null | undefined,
    password: string | null | undefined,
  ) {
    if (useDemoMode) {
      return;
    }

    if (!String(username || '').trim() || !String(password || '').trim()) {
      throw new BadRequestException(
        'LuxPower username va password la bat buoc neu khong dung che do demo.',
      );
    }
  }

  private async ensureConnectionExists(id: string) {
    const exists = await this.prisma.luxPowerConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('LuxPower connection not found');
    }
  }

  private async getConnectionOrThrow(id: string) {
    const connection = await this.prisma.luxPowerConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!connection) {
      throw new NotFoundException('LuxPower connection not found');
    }

    return connection;
  }

  private async ensureSystemExists(solarSystemId?: string) {
    if (!solarSystemId) {
      return;
    }

    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: solarSystemId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!system) {
      throw new BadRequestException('Khong tim thay he thong de lien ket LuxPower.');
    }
  }

  private async createLog(
    connectionId: string,
    payload: {
      action: string;
      status: string;
      message: string;
      context?: Record<string, unknown>;
    },
  ) {
    return this.prisma.luxPowerSyncLog.create({
      data: {
        connectionId,
        action: payload.action,
        status: payload.status,
        message: payload.message,
        context: payload.context as any,
      },
    });
  }

  private async finishLog(
    id: string,
    payload: {
      status: string;
      message: string;
      context?: Record<string, unknown>;
      responsePayload?: Record<string, unknown>;
    },
  ) {
    return this.prisma.luxPowerSyncLog.update({
      where: { id },
      data: {
        status: payload.status,
        message: payload.message,
        context: payload.context as any,
        responsePayload: payload.responsePayload as any,
        finishedAt: new Date(),
      },
    });
  }

  private normalizeConnectionStatus(rawStatus: string | null | undefined, latestAt: Date | null) {
    const normalized = String(rawStatus || '')
      .trim()
      .toUpperCase();

    if (
      normalized.includes('FAULT') ||
      normalized.includes('ERROR') ||
      normalized.includes('FAIL')
    ) {
      return 'LOI';
    }

    if (normalized.includes('WARNING') || normalized.includes('ALARM')) {
      return 'CANH_BAO';
    }

    if (latestAt && Date.now() - latestAt.getTime() <= 90 * 60 * 1000) {
      return 'TRUC_TUYEN';
    }

    return 'CHUA_CO_DU_LIEU_THOI_GIAN_THUC';
  }

  private formatErrorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string' && response.trim()) {
        return response;
      }

      if (response && typeof response === 'object') {
        const payload = response as Record<string, unknown>;
        const message =
          (typeof payload.message === 'string' && payload.message) ||
          (typeof payload.detail === 'string' && payload.detail) ||
          (typeof payload.error === 'string' && payload.error);

        if (message) {
          return message;
        }
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallback;
  }

  private getEncryptionSecret() {
    return (
      this.configService.get<string>('LUXPOWER_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-luxpower-settings'
    );
  }

  private parseDateOrNull(value?: string | null) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toRoundedNumber(value: unknown) {
    const numeric = this.toNullableNumber(value);
    return numeric === null ? null : roundMoney(numeric);
  }

  private toPositiveNumber(value: unknown) {
    const numeric = this.toNullableNumber(value) || 0;
    return roundMoney(Math.max(0, numeric));
  }

  private optionalPositiveNumber(value: unknown) {
    const numeric = this.toNullableNumber(value);
    return numeric === null ? null : roundMoney(Math.max(0, numeric));
  }

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private powerWattsToKw(value: unknown) {
    const numeric = this.toNullableNumber(value);
    return numeric === null ? null : Number((numeric / 1000).toFixed(3));
  }
}
