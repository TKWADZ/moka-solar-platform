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
import { encryptSecret, maskSecret } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeyeConnectionDto } from './dto/create-deye-connection.dto';
import { SyncDeyeConnectionDto } from './dto/sync-deye-connection.dto';
import { UpdateDeyeConnectionDto } from './dto/update-deye-connection.dto';
import { DeyeAuthService } from './deye-auth.service';
import { DeyeHistorySyncService } from './deye-history-sync.service';
import { DeyeStationSyncService } from './deye-station-sync.service';
import { DeyeTelemetrySyncService } from './deye-telemetry-sync.service';

type DeyeConnectionWithRelations = any;

@Injectable()
export class DeyeConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeyeConnectionsService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private syncInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly deyeAuthService: DeyeAuthService,
    private readonly deyeStationSyncService: DeyeStationSyncService,
    private readonly deyeHistorySyncService: DeyeHistorySyncService,
    private readonly deyeTelemetrySyncService: DeyeTelemetrySyncService,
  ) {}

  async onModuleInit() {
    const minutes = Number(this.configService.get('DEYE_SYNC_INTERVAL_MINUTES') || 0);
    if (minutes > 0) {
      this.syncInterval = setInterval(() => {
        void this.syncActiveConnections();
      }, minutes * 60 * 1000);
    }
  }

  onModuleDestroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  async listConnections() {
    const connections = await this.prisma.deyeConnection.findMany({
      where: { deletedAt: null },
      include: this.includeRelations(),
      orderBy: { createdAt: 'desc' },
    });

    return connections.map((connection) => this.serializeConnection(connection));
  }

  async findOne(id: string) {
    const connection = await this.prisma.deyeConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!connection) {
      throw new NotFoundException('Deye connection not found');
    }

    return this.serializeConnection(connection);
  }

  async listLogs(id: string) {
    await this.ensureConnectionExists(id);
    return this.prisma.syncLog.findMany({
      where: {
        source: 'DEYE',
        connectionId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  }

  async create(dto: CreateDeyeConnectionDto, actorId?: string) {
    const connection = await this.prisma.deyeConnection.create({
      data: {
        accountName: dto.accountName.trim(),
        appId: dto.appId.trim(),
        appSecretEncrypted: this.encrypt(dto.appSecret),
        email: dto.email.trim().toLowerCase(),
        passwordEncrypted: this.encrypt(dto.password),
        baseUrl: this.normalizeBaseUrl(dto.baseUrl),
        status: dto.status?.trim() || 'PENDING',
      },
      include: this.includeRelations(),
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'DEYE_CONNECTION_CREATED',
      entityType: 'DeyeConnection',
      entityId: connection.id,
      payload: {
        accountName: connection.accountName,
        email: connection.email,
        baseUrl: connection.baseUrl,
      },
    });

    return this.serializeConnection(connection);
  }

  async update(id: string, dto: UpdateDeyeConnectionDto, actorId?: string) {
    const existing = await this.getConnectionOrThrow(id);

    const updated = await this.prisma.deyeConnection.update({
      where: { id },
      data: {
        accountName: dto.accountName?.trim() ?? existing.accountName,
        appId: dto.appId?.trim() ?? existing.appId,
        appSecretEncrypted: dto.appSecret ? this.encrypt(dto.appSecret) : existing.appSecretEncrypted,
        email: dto.email?.trim().toLowerCase() ?? existing.email,
        passwordEncrypted: dto.password ? this.encrypt(dto.password) : existing.passwordEncrypted,
        baseUrl: dto.baseUrl ? this.normalizeBaseUrl(dto.baseUrl) : existing.baseUrl,
        status: dto.status?.trim() ?? existing.status,
        accessToken: dto.appSecret || dto.password || dto.email || dto.baseUrl || dto.appId ? null : existing.accessToken,
        refreshToken: dto.appSecret || dto.password || dto.email || dto.baseUrl || dto.appId ? null : existing.refreshToken,
        tokenExpiredAt: dto.appSecret || dto.password || dto.email || dto.baseUrl || dto.appId ? null : existing.tokenExpiredAt,
      },
      include: this.includeRelations(),
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'DEYE_CONNECTION_UPDATED',
      entityType: 'DeyeConnection',
      entityId: id,
      payload: {
        accountName: updated.accountName,
        email: updated.email,
        status: updated.status,
      },
    });

    return this.serializeConnection(updated);
  }

  async remove(id: string, actorId?: string) {
    await this.getConnectionOrThrow(id);

    await this.prisma.deyeConnection.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'DEYE_CONNECTION_ARCHIVED',
      entityType: 'DeyeConnection',
      entityId: id,
    });

    return { success: true };
  }

  async testConnection(id: string, actorId?: string) {
    await this.ensureConnectionExists(id);
    const log = await this.createLog(id, {
      syncType: 'TEST_CONNECTION',
      status: 'RUNNING',
      message: 'Dang kiem tra ket noi Deye va xac minh account info.',
    });

    try {
      const result = await this.deyeAuthService.testConnection(id);

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Ket noi thanh cong voi ${result.accountInfo?.orgInfoList?.[0]?.companyName || 'tai khoan Deye'}.`,
        rawPayload: result.accountInfo as Record<string, unknown>,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'DEYE_CONNECTION_TESTED',
        entityType: 'DeyeConnection',
        entityId: id,
      });

      return {
        connection: await this.findOne(id),
        accountInfo: result.accountInfo,
      };
    } catch (error) {
      await this.markConnectionError(id, error);
      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'Test connection that bai.'),
      });
      throw error;
    }
  }

  async syncStations(id: string, actorId?: string) {
    await this.ensureConnectionExists(id);
    const log = await this.createLog(id, {
      syncType: 'SYNC_STATIONS',
      status: 'RUNNING',
      message: 'Dang dong bo station va device tu Deye.',
    });

    try {
      const result = await this.deyeStationSyncService.syncStations(id);

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Dong bo xong ${result.syncedStations.length} station tu Deye.`,
        rawPayload: {
          stations: result.syncedStations,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'DEYE_STATIONS_SYNCED',
        entityType: 'DeyeConnection',
        entityId: id,
        payload: {
          syncedStations: result.syncedStations.length,
        },
      });

      return {
        connection: await this.findOne(id),
        ...result,
      };
    } catch (error) {
      await this.markConnectionError(id, error);
      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'Sync station that bai.'),
      });
      throw error;
    }
  }

  async syncMonthlyHistory(id: string, dto: SyncDeyeConnectionDto, actorId?: string) {
    await this.ensureConnectionExists(id);
    const log = await this.createLog(id, {
      syncType: 'SYNC_MONTHLY_HISTORY',
      status: 'RUNNING',
      message: `Dang dong bo lich su PV thang Deye${dto.year ? ` cho nam ${dto.year}` : ''}.`,
      targetStationId: dto.stationIds?.[0] || null,
      rawPayload: dto as unknown as Record<string, unknown>,
    });

    try {
      if (dto.includeStationSync) {
        await this.deyeStationSyncService.syncStations(id);
      }

      const result = await this.deyeHistorySyncService.syncMonthlyHistory(id, {
        year: dto.year,
        startAt: dto.startAt,
        endAt: dto.endAt,
        stationIds: dto.stationIds,
        actorId,
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Dong bo xong ${result.syncedMonths} ban ghi thang va ${result.syncedBillings} billing record.`,
        rawPayload: result as Record<string, unknown>,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'DEYE_MONTHLY_HISTORY_SYNCED',
        entityType: 'DeyeConnection',
        entityId: id,
        payload: {
          syncedMonths: result.syncedMonths,
          syncedBillings: result.syncedBillings,
          year: result.year,
        },
      });

      return {
        connection: await this.findOne(id),
        ...result,
      };
    } catch (error) {
      await this.markConnectionError(id, error);
      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'Sync monthly history that bai.'),
      });
      throw error;
    }
  }

  async syncMonitoringData(id: string, dto: SyncDeyeConnectionDto, actorId?: string) {
    await this.ensureConnectionExists(id);
    const log = await this.createLog(id, {
      syncType: 'SYNC_MONITORING_DATA',
      status: 'RUNNING',
      message: 'Dang dong bo du lieu realtime, theo gio va theo ngay tu Deye.',
      targetStationId: dto.stationIds?.[0] || null,
      rawPayload: dto as unknown as Record<string, unknown>,
    });

    try {
      const result = await this.deyeTelemetrySyncService.syncOperationalData(id, {
        stationIds: dto.stationIds,
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Dong bo xong ${result.syncedRealtimeRecords} diem telemetry va ${result.syncedDailyRecords} ban ghi ngay.`,
        rawPayload: result as Record<string, unknown>,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'DEYE_MONITORING_SYNCED',
        entityType: 'DeyeConnection',
        entityId: id,
        payload: {
          syncedRealtimeRecords: result.syncedRealtimeRecords,
          syncedDailyRecords: result.syncedDailyRecords,
        },
      });

      return {
        connection: await this.findOne(id),
        ...result,
      };
    } catch (error) {
      await this.markConnectionError(id, error);
      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'Sync monitoring data that bai.'),
      });
      throw error;
    }
  }

  async syncNow(id: string, dto: SyncDeyeConnectionDto, actorId?: string) {
    const stationSync = await this.syncStations(id, actorId);
    const monitoringSync = await this.syncMonitoringData(id, dto, actorId);
    const monthlySync = await this.syncMonthlyHistory(id, dto, actorId);

    return {
      connection: await this.findOne(id),
      year: monthlySync.year,
      startAt: monthlySync.startAt,
      endAt: monthlySync.endAt,
      syncedMonths: monthlySync.syncedMonths,
      syncedBillings: monthlySync.syncedBillings,
      stations: monthlySync.stations,
      syncedRealtimeRecords: monitoringSync.syncedRealtimeRecords,
      syncedDailyRecords: monitoringSync.syncedDailyRecords,
      stationSync,
      monitoringSync,
      monthlySync,
    };
  }

  private async syncActiveConnections() {
    if (this.syncInFlight) {
      return;
    }

    this.syncInFlight = true;
    try {
      const connections = await this.prisma.deyeConnection.findMany({
        where: {
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'CONNECTED', 'SYNCED', 'AUTHORIZED'],
          },
        },
        select: {
          id: true,
        },
      });

      for (const connection of connections) {
        try {
          await this.syncNow(connection.id, { year: new Date().getFullYear() });
        } catch (error) {
          this.logger.warn(
            `Deye scheduled sync failed for ${connection.id}: ${this.formatErrorMessage(error, 'Unknown error')}`,
          );
        }
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  private includeRelations() {
    return {
      customer: {
        include: {
          user: true,
        },
      },
      systems: {
        where: { deletedAt: null },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          devices: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'desc' as const }],
          },
          monthlyEnergyRecords: {
            where: { deletedAt: null },
            orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }],
            take: 12,
          },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      syncLogs: {
        orderBy: { createdAt: 'desc' as const },
        take: 20,
      },
    };
  }

  private serializeConnection(connection: DeyeConnectionWithRelations) {
    const {
      appSecretEncrypted,
      passwordEncrypted,
      accessToken,
      refreshToken,
      ...safeConnection
    } = connection;

    return {
      ...safeConnection,
      accessTokenPreview: this.deyeAuthService.getAccessTokenPreview(accessToken),
      hasStoredAppSecret: Boolean(appSecretEncrypted),
      hasStoredPassword: Boolean(passwordEncrypted),
      systems:
        connection.systems?.map((system: any) => ({
          ...system,
          capacityKwp: Number(system.capacityKwp || 0),
          installedCapacityKwp: Number(system.installedCapacityKwp || 0),
          currentMonthGenerationKwh: Number(system.currentMonthGenerationKwh || 0),
          currentYearGenerationKwh: Number(system.currentYearGenerationKwh || 0),
          totalGenerationKwh: Number(system.totalGenerationKwh || 0),
          currentGenerationPowerKw: Number(system.currentGenerationPowerKw || 0),
          defaultUnitPrice:
            system.defaultUnitPrice !== null && system.defaultUnitPrice !== undefined
              ? Number(system.defaultUnitPrice)
              : null,
          defaultVatRate:
            system.defaultVatRate !== null && system.defaultVatRate !== undefined
              ? Number(system.defaultVatRate)
              : null,
          defaultTaxAmount:
            system.defaultTaxAmount !== null && system.defaultTaxAmount !== undefined
              ? Number(system.defaultTaxAmount)
              : null,
          defaultDiscountAmount:
            system.defaultDiscountAmount !== null && system.defaultDiscountAmount !== undefined
              ? Number(system.defaultDiscountAmount)
              : null,
          devices:
            system.devices?.map((device: any) => ({
              ...device,
              collectionTime:
                device.collectionTime !== null && device.collectionTime !== undefined
                  ? Number(device.collectionTime)
                  : null,
            })) || [],
          monthlyEnergyRecords:
            system.monthlyEnergyRecords?.map((record: any) => ({
              ...record,
              pvGenerationKwh: Number(record.pvGenerationKwh || 0),
              unitPrice: Number(record.unitPrice || 0),
              vatRate: Number(record.vatRate || 0),
              subtotalAmount: Number(record.subtotalAmount || 0),
              taxAmount: Number(record.taxAmount || 0),
              discountAmount: Number(record.discountAmount || 0),
              totalAmount: Number(record.totalAmount || 0),
            })) || [],
        })) || [],
    };
  }

  private normalizeBaseUrl(value: string) {
    return value.trim().replace(/\/$/, '');
  }

  private encrypt(value: string) {
    const secret =
      this.configService.get<string>('DEYE_SETTINGS_SECRET') ||
      this.configService.get<string>('AI_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-deye-settings';

    return encryptSecret(value, secret);
  }

  private async ensureConnectionExists(id: string) {
    const exists = await this.prisma.deyeConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Deye connection not found');
    }
  }

  private async getConnectionOrThrow(id: string) {
    const connection = await this.prisma.deyeConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!connection) {
      throw new NotFoundException('Deye connection not found');
    }

    return connection;
  }

  private async createLog(
    connectionId: string,
    payload: {
      syncType: string;
      status: string;
      message: string;
      targetStationId?: string | null;
      rawPayload?: Record<string, unknown>;
    },
  ) {
    return this.prisma.syncLog.create({
      data: {
        source: 'DEYE',
        connectionId,
        syncType: payload.syncType,
        targetStationId: payload.targetStationId || null,
        status: payload.status,
        message: payload.message,
        rawPayload: payload.rawPayload as any,
      },
    });
  }

  private async finishLog(
    id: string,
    payload: {
      status: string;
      message: string;
      rawPayload?: Record<string, unknown>;
    },
  ) {
    return this.prisma.syncLog.update({
      where: { id },
      data: {
        status: payload.status,
        message: payload.message,
        rawPayload: payload.rawPayload as any,
        finishedAt: new Date(),
      },
    });
  }

  private async markConnectionError(id: string, error: unknown) {
    await this.prisma.deyeConnection.update({
      where: { id },
      data: {
        status: 'ERROR',
        lastError: this.formatErrorMessage(error, 'Unknown Deye error'),
      },
    });
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
}
