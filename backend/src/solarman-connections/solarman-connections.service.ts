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
  assessProviderHistoryBillingEligibility,
  isAuthoritativeManualSource,
} from '../common/config/provider-history-billing';
import {
  calculateVatAmount,
  deriveVatRateFromAmounts,
  normalizePercentRate,
} from '../common/helpers/billing.helper';
import { generateCode, getMonthDateRange, toNumber } from '../common/helpers/domain.helper';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { CreateSolarmanConnectionDto } from './dto/create-solarman-connection.dto';
import { SyncSolarmanConnectionDto } from './dto/sync-solarman-connection.dto';
import { UpdateSolarmanConnectionDto } from './dto/update-solarman-connection.dto';
import {
  ParsedSolarmanDailyHistory,
  ParsedSolarmanDevice,
  ParsedSolarmanMonthlyHistory,
  ParsedSolarmanMonthlyRecord,
  ParsedSolarmanStation,
  toDateTimeValue,
} from './solarman.parser';
import {
  SolarmanPersistedSession,
  SolarmanProviderType,
} from './solarman-client.service';
import { SolarmanProviderRegistry } from './solarman-provider.registry';
import { SolarmanProviderCredentials } from './solarman-provider.types';
import { SolarmanWebOAuthTokenService } from './solarman-web-oauth-token.service';
import {
  decryptSolarmanSecret,
  encryptSolarmanSecret,
} from './solarman-secret.crypto';

type SolarmanConnectionWithRelations = any;
type SolarSystemRecord = any;

function parseSolarmanDate(value: unknown): Date | null {
  const normalized = toDateTimeValue(value);
  return normalized ? new Date(normalized) : null;
}

@Injectable()
export class SolarmanConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolarmanConnectionsService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private syncInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly solarmanProviderRegistry: SolarmanProviderRegistry,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
    private readonly solarmanWebOAuthTokenService: SolarmanWebOAuthTokenService,
  ) {}

  async onModuleInit() {
    const schedulerEnabled =
      String(this.configService.get('MONITOR_SYNC_SCHEDULER_ENABLED') ?? 'true').toLowerCase() !==
      'false';
    if (schedulerEnabled) {
      return;
    }

    const minutes = Number(this.configService.get('SOLARMAN_SYNC_INTERVAL_MINUTES') || 0);
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

  async listConnections(actor?: AuthenticatedUser) {
    const connections = await this.prisma.solarmanConnection.findMany({
      where: { deletedAt: null },
      include: this.includeRelations(),
      orderBy: { createdAt: 'desc' },
    });

    const canViewSecrets = hasPermission(actor?.permissions, 'integration.secrets.view');
    return connections.map((connection) => this.serializeConnection(connection, canViewSecrets));
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const connection = await this.prisma.solarmanConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!connection) {
      throw new NotFoundException('SOLARMAN connection not found');
    }

    return this.serializeConnection(
      connection,
      hasPermission(actor?.permissions, 'integration.secrets.view'),
    );
  }

  async listLogs(id: string) {
    await this.ensureConnectionExists(id);

    const logs = await this.prisma.solarmanSyncLog.findMany({
      where: { connectionId: id },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    return logs;
  }

  async create(dto: CreateSolarmanConnectionDto, actorId?: string) {
    await this.ensureCustomerExists(dto.customerId);
    const providerType = this.normalizeProviderType(dto.providerType);
    if (providerType !== 'WEB_OAUTH_REFRESH_TOKEN' && !dto.password?.trim()) {
      throw new BadRequestException('Password is required for this SOLARMAN provider mode.');
    }

    const connection = await this.prisma.solarmanConnection.create({
      data: {
        accountName: dto.accountName.trim(),
        providerType,
        usernameOrEmail: dto.usernameOrEmail.trim(),
        passwordEncrypted:
          providerType !== 'WEB_OAUTH_REFRESH_TOKEN' && dto.password?.trim()
            ? this.encrypt(dto.password.trim())
            : null,
        customerId: dto.customerId || null,
        defaultUnitPrice: dto.defaultUnitPrice ?? null,
        defaultTaxAmount: dto.defaultTaxAmount ?? null,
        defaultVatRate: deriveVatRateFromAmounts(100, dto.defaultTaxAmount, NaN) ?? null,
        defaultDiscountAmount: dto.defaultDiscountAmount ?? null,
        status:
          providerType === 'WEB_OAUTH_REFRESH_TOKEN'
            ? dto.status?.trim() === 'PAUSED'
              ? 'PAUSED'
              : 'CONFIGURED'
            : dto.status?.trim() || 'CONFIGURED',
        notes: dto.notes?.trim() || null,
      },
      include: this.includeRelations(),
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLARMAN_CONNECTION_CREATED',
      entityType: 'SolarmanConnection',
      entityId: connection.id,
      payload: {
        accountName: connection.accountName,
        usernameOrEmail: connection.usernameOrEmail,
      },
    });

    return this.serializeConnection(connection);
  }

  async update(id: string, dto: UpdateSolarmanConnectionDto, actorId?: string) {
    const existing = await this.getConnectionOrThrow(id);
    await this.ensureCustomerExists(dto.customerId);
    const providerType =
      dto.providerType === undefined
        ? existing.providerType
        : this.normalizeProviderType(dto.providerType);
    const passwordChanged =
      providerType !== 'WEB_OAUTH_REFRESH_TOKEN' && Boolean(dto.password?.trim());
    const resetSession =
      passwordChanged ||
      Boolean(dto.usernameOrEmail && dto.usernameOrEmail.trim() !== existing.usernameOrEmail) ||
      providerType !== existing.providerType;
    const requestedStatus = dto.status?.trim();
    const nextStatus =
      providerType === 'WEB_OAUTH_REFRESH_TOKEN'
        ? resetSession
          ? 'CONFIGURED'
          : requestedStatus === 'PAUSED' || requestedStatus === 'CONFIGURED'
            ? requestedStatus
            : existing.status
        : requestedStatus ?? (resetSession ? 'CONFIGURED' : existing.status);

    const updated = await this.prisma.solarmanConnection.update({
      where: { id },
      data: {
        accountName: dto.accountName?.trim() ?? existing.accountName,
        providerType,
        usernameOrEmail: dto.usernameOrEmail?.trim() ?? existing.usernameOrEmail,
        passwordEncrypted:
          providerType === 'WEB_OAUTH_REFRESH_TOKEN'
            ? null
            : passwordChanged
              ? this.encrypt(dto.password!.trim())
              : existing.passwordEncrypted,
        accessToken: resetSession ? null : existing.accessToken,
        refreshToken: resetSession ? null : existing.refreshToken,
        accessTokenEncrypted: resetSession ? null : existing.accessTokenEncrypted,
        refreshTokenEncrypted: resetSession ? null : existing.refreshTokenEncrypted,
        accessTokenExpiresAt: resetSession ? null : existing.accessTokenExpiresAt,
        lastSuccessfulRefreshAt: resetSession ? null : existing.lastSuccessfulRefreshAt,
        lastRefreshErrorCode: resetSession ? null : existing.lastRefreshErrorCode,
        lastRefreshErrorMessage: resetSession ? null : existing.lastRefreshErrorMessage,
        reauthorizationRequiredAt: resetSession ? null : existing.reauthorizationRequiredAt,
        cookieJar: resetSession ? null : existing.cookieJar,
        cookieJarEncrypted: resetSession ? null : existing.cookieJarEncrypted,
        customerId:
          dto.customerId === undefined ? existing.customerId : dto.customerId || null,
        defaultUnitPrice:
          dto.defaultUnitPrice === undefined
            ? existing.defaultUnitPrice
            : dto.defaultUnitPrice,
        defaultTaxAmount:
          dto.defaultTaxAmount === undefined
            ? existing.defaultTaxAmount
            : dto.defaultTaxAmount,
        defaultVatRate:
          dto.defaultTaxAmount === undefined
            ? existing.defaultVatRate
            : (deriveVatRateFromAmounts(100, dto.defaultTaxAmount, NaN) ?? null),
        defaultDiscountAmount:
          dto.defaultDiscountAmount === undefined
            ? existing.defaultDiscountAmount
            : dto.defaultDiscountAmount,
        status: nextStatus,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
      },
      include: this.includeRelations(),
    });

    if (resetSession) {
      this.solarmanWebOAuthTokenService.invalidate(id);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLARMAN_CONNECTION_UPDATED',
      entityType: 'SolarmanConnection',
      entityId: id,
      payload: {
        accountName: dto.accountName,
        providerType: dto.providerType,
        usernameOrEmail: dto.usernameOrEmail,
        customerId: dto.customerId,
        defaultUnitPrice: dto.defaultUnitPrice,
        defaultTaxAmount: dto.defaultTaxAmount,
        defaultDiscountAmount: dto.defaultDiscountAmount,
        status: dto.status,
        notes: dto.notes,
        passwordChanged,
      },
    });

    return this.serializeConnection(updated);
  }

  async authorizeWebOAuth(id: string, refreshToken: string, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    if (this.normalizeProviderType(connection.providerType) !== 'WEB_OAUTH_REFRESH_TOKEN') {
      throw new BadRequestException(
        'Set provider mode to WEB_OAUTH_REFRESH_TOKEN and save before authorization.',
      );
    }

    const log = await this.createLog(id, {
      action: 'AUTHORIZE_WEB_OAUTH',
      status: 'RUNNING',
      providerType: 'WEB_OAUTH_REFRESH_TOKEN',
      message: 'Dang xac thuc SOLARMAN bang refresh token mot lan.',
    });

    try {
      await this.solarmanWebOAuthTokenService.authorize(id, refreshToken);
      const provider = this.solarmanProviderRegistry.resolve('WEB_OAUTH_REFRESH_TOKEN');
      const result = await provider.testConnection(this.toCredentials(connection));
      const stationSyncAt = new Date();

      for (const station of result.stations) {
        await this.resolveSystemForStation(connection, station, true);
      }

      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          providerType: 'WEB_OAUTH_REFRESH_TOKEN',
          accessToken: null,
          refreshToken: null,
          cookieJar: null,
          cookieJarEncrypted: null,
          status: 'VERIFIED',
          lastAuthAt: stationSyncAt,
          lastSuccessfulStationSyncAt: stationSyncAt,
          lastDiscoveredStationCount: result.stations.length,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorDetails: null,
          providerMetadata: {
            mode: 'web_oauth_refresh_token',
            lastTestStationCount: result.stations.length,
          } as any,
        },
      });

      await this.captureDebugSnapshot(id, {
        snapshotType: 'PLANT_LIST',
        providerType: 'WEB_OAUTH_REFRESH_TOKEN',
        capturedAt: stationSyncAt,
        payload: result.rawResponses.plantList || null,
        note: 'Plant list returned after one-time SOLARMAN authorization.',
      });
      await this.finishLog(log.id, {
        status: 'SUCCESS',
        providerType: 'WEB_OAUTH_REFRESH_TOKEN',
        message: `Xac thuc thanh cong va phat hien ${result.stations.length} station.`,
        syncedStations: result.stations.length,
        context: {
          stationCount: result.stations.length,
          deviceCount: result.sampleDevices.length,
        },
      });
      await this.auditLogsService.log({
        userId: actorId,
        action: 'SOLARMAN_WEB_OAUTH_AUTHORIZED',
        entityType: 'SolarmanConnection',
        entityId: id,
        payload: {
          providerType: 'WEB_OAUTH_REFRESH_TOKEN',
          stationCount: result.stations.length,
        },
      });

      return {
        connection: await this.findOne(id),
        stations: result.stations,
        sampleDevices: result.sampleDevices,
      };
    } catch (error) {
      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          status: this.resolveConnectionStatusForError(error),
          lastErrorCode: this.resolveErrorCode(error),
          lastErrorMessage: this.formatErrorMessage(error, 'SOLARMAN authorization failed.'),
          lastErrorDetails: this.toErrorPayload(error) as any,
        },
      });
      await this.finishLog(log.id, {
        status: 'ERROR',
        providerType: 'WEB_OAUTH_REFRESH_TOKEN',
        errorCode: this.resolveErrorCode(error),
        message: this.formatErrorMessage(error, 'SOLARMAN authorization failed.'),
      });
      throw error;
    }
  }

  async remove(id: string, actorId?: string) {
    await this.getConnectionOrThrow(id);

    await this.prisma.solarmanConnection.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    });
    this.solarmanWebOAuthTokenService.invalidate(id);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLARMAN_CONNECTION_ARCHIVED',
      entityType: 'SolarmanConnection',
      entityId: id,
    });

    return { success: true };
  }

  async testConnection(id: string, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    const credentials = this.toCredentials(connection);
    const provider = this.solarmanProviderRegistry.resolve(connection.providerType);

    const log = await this.createLog(connection.id, {
      action: 'TEST_CONNECTION',
      status: 'RUNNING',
      message: 'Đang kiểm tra đăng nhập SOLARMAN và lấy danh sách station.',
    });

    try {
      const result = await provider.testConnection(credentials, {
        persistedSession: this.restorePersistedSession(connection),
      });

      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          providerType: provider.providerType,
          accessToken: null,
          refreshToken: null,
          accessTokenEncrypted:
            provider.providerType === 'OFFICIAL_OPENAPI' && result.session?.token
              ? this.encrypt(result.session.token)
              : provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN'
                ? undefined
                : null,
          accessTokenExpiresAt:
            provider.providerType === 'OFFICIAL_OPENAPI' && result.session?.expiresAt
              ? new Date(result.session.expiresAt)
              : provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN'
                ? undefined
                : null,
          refreshTokenEncrypted:
            provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN' ? undefined : null,
          cookieJar:
            provider.providerType === 'COOKIE_SESSION' && result.session?.cookieJar
              ? { mode: result.mode, persisted: true }
              : null,
          cookieJarEncrypted:
            provider.providerType === 'COOKIE_SESSION' && result.session?.cookieJar
              ? this.encrypt(result.session.cookieJar)
              : null,
          status: 'VERIFIED',
          lastAuthAt: new Date(),
          lastSuccessfulStationSyncAt: new Date(),
          lastDiscoveredStationCount: result.stations.length,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorDetails: null,
          providerMetadata: {
            mode: result.mode,
            lastTestStationCount: result.stations.length,
          } as any,
        },
      });

      await this.captureDebugSnapshot(connection.id, {
        snapshotType: 'PLANT_LIST',
        providerType: provider.providerType,
        capturedAt: new Date(),
        payload: result.rawResponses.plantList || null,
        note: 'Latest plant list payload from test connection.',
      });
      if (result.rawResponses.deviceList) {
        await this.captureDebugSnapshot(connection.id, {
          snapshotType: 'DEVICE_LIST',
          providerType: provider.providerType,
          capturedAt: new Date(),
          payload: result.rawResponses.deviceList,
          note: 'Latest device list payload from test connection.',
        });
      }

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Ket noi thanh cong. Nhan ${result.stations.length} plant tu SOLARMAN.`,
        context: {
          stationCount: result.stations.length,
          deviceCount: result.sampleDevices.length,
          mode: result.mode,
        },
        responsePayload: result.rawResponses as Record<string, unknown>,
        syncedStations: result.stations.length,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'SOLARMAN_CONNECTION_TESTED',
        entityType: 'SolarmanConnection',
        entityId: id,
        payload: {
          providerType: provider.providerType,
          stationCount: result.stations.length,
          deviceCount: result.sampleDevices.length,
        },
      });

      return {
        connection: await this.findOne(id),
        stations: result.stations,
        sampleDevices: result.sampleDevices,
      };
    } catch (error) {
      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          status: this.resolveConnectionStatusForError(error),
          lastErrorCode: this.resolveErrorCode(error),
          lastErrorMessage: this.formatErrorMessage(error, 'Test connection that bai.'),
          lastErrorDetails: this.toErrorPayload(error) as any,
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        errorCode: this.resolveErrorCode(error),
        message: this.formatErrorMessage(error, 'Test connection that bai.'),
        responsePayload: this.toErrorPayload(error),
      });

      throw error;
    }
  }

  async discoverPlants(id: string, actorId?: string) {
    const result = await this.testConnection(id, actorId);

    return {
      connection: result.connection,
      stations: result.stations,
      sampleDevices: result.sampleDevices,
    };
  }

  async syncNow(id: string, dto: SyncSolarmanConnectionDto, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    return this.syncSingleConnection(connection, dto, actorId, 'MANUAL_SYNC');
  }

  async syncRealtimeSystem(connectionId: string, systemId: string) {
    const connection = await this.getConnectionOrThrow(connectionId);
    const system = connection.systems.find((item: any) => item.id === systemId);
    if (!system) {
      throw new NotFoundException('SOLARMAN system is not linked to this connection.');
    }

    const provider = this.solarmanProviderRegistry.resolve(connection.providerType);
    const result = await provider.testConnection(this.toCredentials(connection), {
      persistedSession: this.restorePersistedSession(connection),
    });
    const stationId = system.stationId || system.monitoringPlantId;
    const station = result.stations.find((item) => item.stationId === stationId);
    if (!station) {
      throw new NotFoundException('SOLARMAN station was not returned by the provider.');
    }

    await this.resolveSystemForStation(connection, station, false);
    const syncedAt = new Date();
    await this.prisma.solarmanConnection.update({
      where: { id: connectionId },
      data: {
        status: 'VERIFIED',
        lastSuccessfulStationSyncAt: syncedAt,
        lastDiscoveredStationCount: result.stations.length,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorDetails: null,
      },
    });

    return {
      provider: 'SOLARMAN',
      plantId: station.stationId,
      plantName: station.stationName,
      currentPvKw: station.generationPowerKw,
      batterySocPct: null,
      loadPowerKw: null,
      gridPowerKw: null,
      batteryPowerKw: null,
      inverterStatus: null,
      fetchedAt: station.lastUpdateTime || syncedAt.toISOString(),
    };
  }

  private async syncActiveConnections() {
    if (this.syncInFlight) {
      return;
    }

    this.syncInFlight = true;

    try {
      const connections = await this.prisma.solarmanConnection.findMany({
        where: {
          deletedAt: null,
          OR: [
            { status: { in: ['ACTIVE', 'VERIFIED'] } },
            { providerType: 'WEB_OAUTH_REFRESH_TOKEN', status: 'ERROR' },
          ],
        },
        include: this.includeRelations(),
      });

      for (const connection of connections) {
        try {
          await this.syncSingleConnection(
            connection,
            {
              year: new Date().getFullYear(),
              createMissingSystems: true,
            },
            undefined,
            'SCHEDULED_SYNC',
          );
        } catch (error) {
          this.logger.error(
            `Scheduled SOLARMAN sync failed for ${connection.accountName}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  private async syncSingleConnection(
    connectionInput: SolarmanConnectionWithRelations,
    dto: SyncSolarmanConnectionDto,
    actorId?: string,
    action = 'MANUAL_SYNC',
  ) {
    const connection =
      connectionInput.customer && connectionInput.systems && connectionInput.syncLogs
        ? connectionInput
        : await this.getConnectionOrThrow(connectionInput.id);
    const credentials = this.toCredentials(connection);
    const provider = this.solarmanProviderRegistry.resolve(connection.providerType);
    const syncYear = dto.year || new Date().getFullYear();
    const createMissingSystems = dto.createMissingSystems ?? true;

    const log = await this.createLog(connection.id, {
      action,
      status: 'RUNNING',
      providerType: provider.providerType,
      message: `Đang đồng bộ SOLARMAN cho năm ${syncYear}.`,
      context: {
        year: syncYear,
        createMissingSystems,
      },
    });

    let syncedStations = 0;
    let syncedMonths = 0;
    let syncedBillings = 0;

    try {
      const testResult = await provider.testConnection(credentials, {
        persistedSession: this.restorePersistedSession(connection),
      });
      const stations = testResult.stations;
      const selectedStationIds = new Set(dto.stationIds?.filter(Boolean) || []);
      const targetStations = selectedStationIds.size
        ? stations.filter((station) => selectedStationIds.has(station.stationId))
        : stations;

      const stationResults: Array<Record<string, unknown>> = [];

      for (const station of targetStations) {
        const stationResult = await this.syncStation({
          connection,
          credentials,
          providerType: provider.providerType,
          persistedSession: testResult.session,
          station,
          year: syncYear,
          actorId,
          createMissingSystems,
        });

        syncedStations += stationResult.stationSynced ? 1 : 0;
        syncedMonths += stationResult.syncedMonths;
        syncedBillings += stationResult.syncedBillings;
        stationResults.push(stationResult);
      }

      await this.prisma.solarmanConnection.update({
        where: { id: connection.id },
        data: {
          providerType: provider.providerType,
          accessToken: null,
          refreshToken: null,
          accessTokenEncrypted:
            provider.providerType === 'OFFICIAL_OPENAPI' && testResult.session?.token
              ? this.encrypt(testResult.session.token)
              : provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN'
                ? undefined
                : null,
          accessTokenExpiresAt:
            provider.providerType === 'OFFICIAL_OPENAPI' && testResult.session?.expiresAt
              ? new Date(testResult.session.expiresAt)
              : provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN'
                ? undefined
                : null,
          refreshTokenEncrypted:
            provider.providerType === 'WEB_OAUTH_REFRESH_TOKEN' ? undefined : null,
          cookieJar:
            provider.providerType === 'COOKIE_SESSION' && testResult.session?.cookieJar
              ? { mode: testResult.mode, persisted: true }
              : null,
          cookieJarEncrypted:
            provider.providerType === 'COOKIE_SESSION' && testResult.session?.cookieJar
              ? this.encrypt(testResult.session.cookieJar)
              : null,
          status: 'VERIFIED',
          lastSyncTime: new Date(),
          lastSuccessfulSyncAt: new Date(),
          lastSuccessfulStationSyncAt: new Date(),
          lastDiscoveredStationCount: stations.length,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorDetails: null,
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Đồng bộ xong ${syncedStations} station, ${syncedMonths} record tháng và ${syncedBillings} billing record.`,
        syncedStations,
        syncedMonths,
        syncedBillings,
        context: {
          providerType: provider.providerType,
          year: syncYear,
          stations: stationResults,
        },
        responsePayload: {
          providerType: provider.providerType,
          stationCount: stations.length,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'SOLARMAN_CONNECTION_SYNCED',
        entityType: 'SolarmanConnection',
        entityId: connection.id,
        payload: {
          providerType: provider.providerType,
          syncedStations,
          syncedMonths,
          syncedBillings,
          year: syncYear,
        },
      });

      return {
        connection: await this.findOne(connection.id),
        syncedStations,
        syncedMonths,
        syncedBillings,
        stations: stationResults,
      };
    } catch (error) {
      await this.prisma.solarmanConnection.update({
        where: { id: connection.id },
        data: {
          status: this.resolveConnectionStatusForError(error),
          lastErrorCode: this.resolveErrorCode(error),
          lastErrorMessage: this.formatErrorMessage(error, 'SOLARMAN sync that bai.'),
          lastErrorDetails: this.toErrorPayload(error) as any,
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'SOLARMAN sync that bai.'),
        syncedStations,
        syncedMonths,
        syncedBillings,
        errorCode: this.resolveErrorCode(error),
        responsePayload: this.toErrorPayload(error),
      });

      throw error;
    }
  }

  private async syncStation(params: {
    connection: SolarmanConnectionWithRelations;
    credentials: SolarmanProviderCredentials;
    providerType: SolarmanProviderType;
    persistedSession?: SolarmanPersistedSession | null;
    station: ParsedSolarmanStation;
    year: number;
    actorId?: string;
    createMissingSystems: boolean;
  }) {
    const {
      connection,
      credentials,
      providerType,
      persistedSession,
      station,
      year,
      actorId,
      createMissingSystems,
    } = params;
    const system = await this.resolveSystemForStation(connection, station, createMissingSystems);

    if (!system) {
      return {
        stationId: station.stationId,
        stationName: station.stationName,
        stationSynced: false,
        syncedMonths: 0,
        syncedBillings: 0,
        reason:
          'Station chưa có customer mặc định để tạo system mới. Hãy gắn customer cho connection hoặc map tay tại trang hệ thống.',
      };
    }

    const provider = this.solarmanProviderRegistry.resolve(providerType);
    const bundle = await provider.fetchHistoryBundle(credentials, station.stationId, year, {
      persistedSession,
    });
    const selectedStation = bundle.station || station;

    await this.captureDebugSnapshot(connection.id, {
      solarSystemId: system.id,
      stationId: selectedStation.stationId,
      providerType,
      snapshotType: 'PLANT_LIST',
      capturedAt: new Date(),
      payload: bundle.rawResponses.plantList || null,
      note: 'Plant list payload used during SOLARMAN sync.',
    });
    await this.captureDebugSnapshot(connection.id, {
      solarSystemId: system.id,
      stationId: selectedStation.stationId,
      deviceSn: bundle.devices[0]?.serialNumber || null,
      providerType,
      snapshotType: 'DEVICE_LIST',
      capturedAt: new Date(),
      payload: bundle.rawResponses.deviceList || null,
      note: 'Device list payload used during SOLARMAN sync.',
    });
    await this.captureDebugSnapshot(connection.id, {
      solarSystemId: system.id,
      stationId: selectedStation.stationId,
      providerType,
      snapshotType: 'DAILY_HISTORY',
      capturedAt: new Date(),
      payload: bundle.rawResponses.dailyHistory || null,
      note: 'Daily history payload used for billing-grade sync.',
    });
    await this.captureDebugSnapshot(connection.id, {
      solarSystemId: system.id,
      stationId: selectedStation.stationId,
      providerType,
      snapshotType: 'MONTHLY_HISTORY',
      capturedAt: new Date(),
      payload: bundle.rawResponses.monthlyHistory || null,
      note: 'Monthly aggregate payload used for reconciliation.',
    });

    const syncedDailyRecords = await this.upsertDailyHistoryRecords({
      connection,
      system,
      station: selectedStation,
      dailyHistory: bundle.dailyHistory,
    });
    const monthlyHistory =
      bundle.dailyHistory?.records.length
        ? this.aggregateMonthlyHistoryFromDaily(bundle.dailyHistory)
        : bundle.monthlyHistory;

    let syncedMonths = 0;
    let syncedBillings = 0;
    const billingBlockedReasons = new Set<string>();

    if (monthlyHistory) {
      for (const monthlyRecord of monthlyHistory.records) {
        const importResult = await this.upsertMonthlyRecord({
          connection,
          system,
          station: selectedStation,
          monthlyRecord,
          expectedYear: year,
          historyDataQualityStatus: monthlyHistory.dataQualityStatus,
          actorId,
        });
        syncedMonths += importResult.recordPersisted ? 1 : 0;
        syncedBillings += importResult.billingSynced ? 1 : 0;
        for (const reason of importResult.billingSkipReasons) {
          billingBlockedReasons.add(reason);
        }
      }
    }

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        currentMonthGenerationKwh:
          selectedStation.generationMonthKwh ?? system.currentMonthGenerationKwh,
        currentYearGenerationKwh:
          selectedStation.generationYearKwh ?? system.currentYearGenerationKwh,
        totalGenerationKwh: selectedStation.generationTotalKwh ?? system.totalGenerationKwh,
        currentGenerationPowerKw:
          selectedStation.generationPowerKw ?? system.currentGenerationPowerKw,
        latestMonitorAt:
          parseSolarmanDate(selectedStation.lastUpdateTime) ?? system.latestMonitorAt,
      },
    });

    return {
      stationId: selectedStation.stationId,
      stationName: selectedStation.stationName,
      systemId: system.id,
      systemName: system.name,
      stationSynced: true,
      syncedDailyRecords,
      syncedMonths,
      syncedBillings,
      providerType,
      dailyCoverage:
        bundle.dailyHistory?.records.length || 0,
      monthlyCoverage:
        monthlyHistory?.records.length || 0,
      monthlyHistoryDataQuality:
        monthlyHistory?.dataQualityStatus || 'UNVERIFIED',
      rejectedMonthlyRecords:
        monthlyHistory?.rejectedRecordCount || 0,
      billingBlockedReasons: Array.from(billingBlockedReasons),
    };
  }

  private async resolveSystemForStation(
    connection: SolarmanConnectionWithRelations,
    station: ParsedSolarmanStation,
    createMissingSystems: boolean,
  ): Promise<SolarSystemRecord | null> {
    const existing = await this.prisma.solarSystem.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { sourceSystem: 'SOLARMAN', stationId: station.stationId },
          { monitoringProvider: 'SOLARMAN', monitoringPlantId: station.stationId },
        ],
      },
    });

    const nextCapacity = station.installedCapacityKw ?? 0;
    const latestMonitorAt = parseSolarmanDate(station.lastUpdateTime);

    if (existing) {
      return this.prisma.solarSystem.update({
        where: { id: existing.id },
        data: {
          stationId: station.stationId,
          stationName: station.stationName ?? undefined,
          sourceSystem: 'SOLARMAN',
          hasBattery: station.hasBattery ?? undefined,
          timeZone: station.timezone ?? undefined,
          externalPayload: station.raw as any,
          installedCapacityKwp: station.installedCapacityKw ?? undefined,
          capacityKwp:
            toNumber(existing.capacityKwp) > 0
              ? existing.capacityKwp
              : nextCapacity,
          monitoringProvider: 'SOLARMAN',
          monitoringPlantId: station.stationId,
          solarmanConnectionId: connection.id,
          latestMonitorSnapshot: {
            provider: 'SOLARMAN',
            stationId: station.stationId,
            stationName: station.stationName,
            generationMonthKwh: station.generationMonthKwh,
            generationYearKwh: station.generationYearKwh,
            generationTotalKwh: station.generationTotalKwh,
            generationPowerKw: station.generationPowerKw,
            lastUpdateTime: station.lastUpdateTime,
            raw: station.raw,
          } as any,
          latestMonitorAt: latestMonitorAt ?? undefined,
          currentMonthGenerationKwh: station.generationMonthKwh ?? undefined,
          currentYearGenerationKwh: station.generationYearKwh ?? undefined,
          totalGenerationKwh: station.generationTotalKwh ?? undefined,
          currentGenerationPowerKw: station.generationPowerKw ?? undefined,
          providerLastSeenAt: new Date(),
          providerDisconnectedAt: null,
        },
      });
    }

    if (!createMissingSystems) {
      return null;
    }

    return this.prisma.solarSystem.create({
      data: {
        customerId: connection.customerId || null,
        systemCode: generateCode('SYS-SLRM'),
        name: station.stationName || `SOLARMAN ${station.stationId}`,
        systemType: station.powerType || 'PV',
        capacityKwp: nextCapacity,
        installedCapacityKwp: station.installedCapacityKw,
        panelCount: 0,
        inverterBrand: 'SOLARMAN',
        monitoringProvider: 'SOLARMAN',
        monitoringPlantId: station.stationId,
        stationId: station.stationId,
        stationName: station.stationName,
        sourceSystem: 'SOLARMAN',
        hasBattery: station.hasBattery,
        timeZone: station.timezone,
        externalPayload: station.raw as any,
        solarmanConnectionId: connection.id,
        defaultUnitPrice: connection.defaultUnitPrice,
        defaultTaxAmount: connection.defaultTaxAmount,
        defaultDiscountAmount: connection.defaultDiscountAmount,
        currentMonthGenerationKwh: station.generationMonthKwh,
        currentYearGenerationKwh: station.generationYearKwh,
        totalGenerationKwh: station.generationTotalKwh,
        currentGenerationPowerKw: station.generationPowerKw,
        latestMonitorSnapshot: {
          provider: 'SOLARMAN',
          stationId: station.stationId,
          stationName: station.stationName,
          generationMonthKwh: station.generationMonthKwh,
          generationYearKwh: station.generationYearKwh,
          generationTotalKwh: station.generationTotalKwh,
          generationPowerKw: station.generationPowerKw,
          lastUpdateTime: station.lastUpdateTime,
          raw: station.raw,
        } as any,
        latestMonitorAt,
        providerLastSeenAt: new Date(),
        providerDisconnectedAt: null,
        status: 'ACTIVE',
      },
    });
  }

  private async upsertMonthlyRecord(params: {
    connection: SolarmanConnectionWithRelations;
    system: SolarSystemRecord;
    station: ParsedSolarmanStation;
    monthlyRecord: ParsedSolarmanMonthlyRecord;
    expectedYear: number;
    historyDataQualityStatus: ParsedSolarmanMonthlyHistory['dataQualityStatus'];
    actorId?: string;
  }) {
    const {
      connection,
      system,
      station,
      monthlyRecord,
      expectedYear,
      historyDataQualityStatus,
      actorId,
    } = params;
    const [existingEnergyRecord, existingBilling] = await Promise.all([
      this.prisma.monthlyEnergyRecord.findUnique({
        where: {
          solarSystemId_year_month: {
            solarSystemId: system.id,
            year: monthlyRecord.year,
            month: monthlyRecord.month,
          },
        },
      }),
      this.prisma.monthlyPvBilling.findUnique({
        where: {
          solarSystemId_month_year: {
            solarSystemId: system.id,
            year: monthlyRecord.year,
            month: monthlyRecord.month,
          },
        },
      }),
    ]);
    const manuallyLocked = Boolean(
      isAuthoritativeManualSource(existingEnergyRecord?.source) ||
        isAuthoritativeManualSource(existingBilling?.source) ||
        existingBilling?.manualOverrideKwh !== null &&
          existingBilling?.manualOverrideKwh !== undefined,
    );

    if (manuallyLocked) {
      return {
        monthlyEnergyRecord: existingEnergyRecord,
        billingSynced: false,
        recordPersisted: false,
        billingSkipReasons: ['MANUAL_DATA_LOCKED'],
      };
    }

    const pricing = await this.resolvePricingDefaults(connection, system, monthlyRecord);
    const source =
      monthlyRecord.raw?.source === 'AGGREGATED_DAILY'
        ? 'SOLARMAN_DAILY_AGGREGATE'
        : 'SOLARMAN_MONTHLY';
    const normalizedRawPayload = {
      ...monthlyRecord.raw,
      _mokaHistory: {
        dataQualityStatus: historyDataQualityStatus,
        expectedYear,
        stationVerified: monthlyRecord.systemId === station.stationId,
      },
    };
    const subtotalAmount = this.roundAmount(monthlyRecord.pvGenerationKwh * pricing.unitPrice);
    const taxAmount = calculateVatAmount(subtotalAmount, pricing.vatRate);
    const totalAmount = this.roundAmount(subtotalAmount + taxAmount - pricing.discountAmount);

    const monthlyEnergyRecord = await this.prisma.monthlyEnergyRecord.upsert({
      where: {
        solarSystemId_year_month: {
          solarSystemId: system.id,
          year: monthlyRecord.year,
          month: monthlyRecord.month,
        },
      },
      update: {
        solarSystemId: system.id,
        customerId: system.customerId,
        connectionId: connection.id,
        stationId: station.stationId,
        pvGenerationKwh: monthlyRecord.pvGenerationKwh,
        loadConsumedKwh: monthlyRecord.loadConsumedKwh,
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source,
        syncTime: new Date(),
        rawPayload: normalizedRawPayload as any,
        note: pricing.note,
        deletedAt: null,
      },
      create: {
        solarSystemId: system.id,
        customerId: system.customerId,
        connectionId: connection.id,
        stationId: station.stationId,
        year: monthlyRecord.year,
        month: monthlyRecord.month,
        pvGenerationKwh: monthlyRecord.pvGenerationKwh,
        loadConsumedKwh: monthlyRecord.loadConsumedKwh,
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source,
        syncTime: new Date(),
        rawPayload: normalizedRawPayload as any,
        note: pricing.note,
      },
    });

    const eligibility = assessProviderHistoryBillingEligibility({
      provider: 'SOLARMAN',
      historyContractVerified: historyDataQualityStatus === 'VERIFIED_HISTORY',
      stationVerified: monthlyRecord.systemId === station.stationId,
      periodValid:
        Number.isInteger(monthlyRecord.month) &&
        monthlyRecord.month >= 1 &&
        monthlyRecord.month <= 12,
      expectedYearMatches: monthlyRecord.year === expectedYear,
      dataQualityStatus: historyDataQualityStatus,
      pvGenerationKwh: monthlyRecord.pvGenerationKwh,
      customerAssigned: Boolean(system.customerId),
      manuallyLocked: false,
    });

    if (!eligibility.eligible) {
      return {
        monthlyEnergyRecord,
        billingSynced: false,
        recordPersisted: true,
        billingSkipReasons: eligibility.reasons,
      };
    }

    let billingSynced = false;
    try {
      await this.monthlyPvBillingsService.sync(
        system.id,
        {
          month: monthlyRecord.month,
          year: monthlyRecord.year,
          pvGenerationKwh: monthlyRecord.pvGenerationKwh,
          unitPrice: pricing.unitPrice,
          vatRate: pricing.vatRate,
          discountAmount: pricing.discountAmount,
          source,
          note: pricing.note,
        },
        actorId,
        {
          provider: 'SOLARMAN',
          historyContractVerified: historyDataQualityStatus === 'VERIFIED_HISTORY',
          stationVerified: monthlyRecord.systemId === station.stationId,
          periodValid:
            Number.isInteger(monthlyRecord.month) &&
            monthlyRecord.month >= 1 &&
            monthlyRecord.month <= 12,
          expectedYearMatches: monthlyRecord.year === expectedYear,
          dataQualityStatus: historyDataQualityStatus,
          pvGenerationKwh: monthlyRecord.pvGenerationKwh,
          customerAssigned: Boolean(system.customerId),
          manuallyLocked: false,
        },
      );
      billingSynced = true;
    } catch (error) {
      await this.prisma.solarmanSyncLog.create({
        data: {
          connectionId: connection.id,
          providerType: connection.providerType || null,
          action: 'SYNC_BILLING_WARNING',
          status: 'WARNING',
          message: this.formatErrorMessage(
            error,
            'Khong the dong bo billing tu ban ghi SOLARMAN.',
          ),
          context: {
            systemId: system.id,
            stationId: station.stationId,
            month: monthlyRecord.month,
            year: monthlyRecord.year,
          },
        },
      });
    }

    return {
      monthlyEnergyRecord,
      billingSynced,
      recordPersisted: true,
      billingSkipReasons: [] as string[],
    };
  }

  private async resolvePricingDefaults(
    connection: SolarmanConnectionWithRelations,
    system: SolarSystemRecord,
    monthlyRecord: ParsedSolarmanMonthlyRecord,
  ) {
    const existingMonthly = await this.prisma.monthlyEnergyRecord.findFirst({
      where: {
        solarSystemId: system.id,
        year: monthlyRecord.year,
        month: monthlyRecord.month,
        deletedAt: null,
      },
    });

    const contract = await this.resolveContract(system.id, monthlyRecord.month, monthlyRecord.year);
    const customerDefaults = system.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: system.customerId,
            deletedAt: null,
          },
          select: {
            defaultUnitPrice: true,
            defaultTaxAmount: true,
            defaultVatRate: true,
            defaultDiscountAmount: true,
          },
        })
      : null;

    const unitPrice = this.roundAmount(
      toNumber(system.defaultUnitPrice) ||
        toNumber(customerDefaults?.defaultUnitPrice) ||
        toNumber(connection.defaultUnitPrice) ||
        toNumber(existingMonthly?.unitPrice) ||
        toNumber(contract?.pricePerKwh) ||
        toNumber(contract?.servicePackage?.pricePerKwh) ||
        0,
    );
    const vatRate = normalizePercentRate(
      toNumber(system.defaultVatRate) ||
        toNumber(customerDefaults?.defaultVatRate) ||
        toNumber(connection.defaultVatRate) ||
        toNumber(existingMonthly?.vatRate) ||
        deriveVatRateFromAmounts(100, system.defaultTaxAmount, NaN) ||
        deriveVatRateFromAmounts(100, customerDefaults?.defaultTaxAmount, NaN) ||
        deriveVatRateFromAmounts(100, connection.defaultTaxAmount, NaN) ||
        deriveVatRateFromAmounts(100, existingMonthly?.taxAmount, NaN) ||
        0,
    );
    const discountAmount = this.roundAmount(
      toNumber(system.defaultDiscountAmount) ||
        toNumber(customerDefaults?.defaultDiscountAmount) ||
        toNumber(connection.defaultDiscountAmount) ||
        toNumber(existingMonthly?.discountAmount) ||
        0,
    );

    const note =
      unitPrice > 0
        ? `SOLARMAN monthly sync - ${monthlyRecord.month}/${monthlyRecord.year}`
        : 'Đã lưu sản lượng PV từ SOLARMAN nhưng chưa có đơn giá mặc định để phát hành billing.';

    return {
      unitPrice,
      vatRate,
      discountAmount,
      note,
    };
  }

  private async resolveContract(systemId: string, month: number, year: number) {
    const { from, to } = getMonthDateRange(year, month);

    return this.prisma.contract.findFirst({
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
  }

  private async captureDebugSnapshot(
    connectionId: string,
    payload: {
      solarSystemId?: string | null;
      stationId?: string | null;
      deviceSn?: string | null;
      providerType: string;
      snapshotType: string;
      capturedAt: Date;
      payload?: Record<string, unknown> | null;
      note?: string | null;
    },
  ) {
    return this.prisma.solarmanDebugSnapshot.create({
      data: {
        connectionId,
        solarSystemId: payload.solarSystemId || null,
        stationId: payload.stationId || null,
        deviceSn: payload.deviceSn || null,
        providerType: payload.providerType,
        snapshotType: payload.snapshotType,
        capturedAt: payload.capturedAt,
        payload: payload.payload as any,
        note: payload.note || null,
      },
    });
  }

  private async upsertDailyHistoryRecords(params: {
    connection: SolarmanConnectionWithRelations;
    system: SolarSystemRecord;
    station: ParsedSolarmanStation;
    dailyHistory: ParsedSolarmanDailyHistory | null;
  }) {
    const { connection, system, station, dailyHistory } = params;
    if (!dailyHistory?.records.length) {
      return 0;
    }

    let synced = 0;
    for (const record of dailyHistory.records) {
      const solarGeneratedKwh = this.roundAmount(record.pvGenerationKwh);
      const loadConsumedKwh = this.roundAmount(record.loadConsumedKwh || 0);
      const gridImportedKwh = this.roundAmount(record.gridImportedKwh || 0);
      const gridExportedKwh = this.roundAmount(record.gridExportedKwh || 0);
      const selfConsumedKwh = this.roundAmount(
        Math.max(0, solarGeneratedKwh - gridExportedKwh),
      );
      const savingAmount = this.roundAmount(selfConsumedKwh * 2200 + gridExportedKwh * 900);

      await this.prisma.energyRecord.upsert({
        where: {
          solarSystemId_recordDate: {
            solarSystemId: system.id,
            recordDate: new Date(record.recordDate),
          },
        },
        update: {
          solarGeneratedKwh,
          loadConsumedKwh,
          gridImportedKwh,
          gridExportedKwh,
          selfConsumedKwh,
          savingAmount,
        },
        create: {
          solarSystemId: system.id,
          recordDate: new Date(record.recordDate),
          solarGeneratedKwh,
          loadConsumedKwh,
          gridImportedKwh,
          gridExportedKwh,
          selfConsumedKwh,
          savingAmount,
        },
      });

      synced += 1;
    }

    await this.captureDebugSnapshot(connection.id, {
      solarSystemId: system.id,
      stationId: station.stationId,
      providerType: connection.providerType || 'COOKIE_SESSION',
      snapshotType: 'DAILY_NORMALIZED',
      capturedAt: new Date(),
      payload: {
        recordCount: dailyHistory.records.length,
        firstRecord: dailyHistory.records[0],
        lastRecord: dailyHistory.records[dailyHistory.records.length - 1],
      },
      note: 'Normalized daily billing-grade metrics saved into EnergyRecord.',
    });

    return synced;
  }

  private aggregateMonthlyHistoryFromDaily(
    dailyHistory: ParsedSolarmanDailyHistory,
  ): ParsedSolarmanMonthlyHistory {
    const buckets = new Map<number, ParsedSolarmanMonthlyRecord>();

    for (const record of dailyHistory.records) {
      const existing = buckets.get(record.month);
      if (existing) {
        existing.pvGenerationKwh = this.roundAmount(existing.pvGenerationKwh + record.pvGenerationKwh);
        existing.loadConsumedKwh = this.sumNullable(existing.loadConsumedKwh, record.loadConsumedKwh);
        existing.gridImportedKwh = this.sumNullable(existing.gridImportedKwh, record.gridImportedKwh);
        existing.gridExportedKwh = this.sumNullable(existing.gridExportedKwh, record.gridExportedKwh);
        existing.batteryChargeKwh = this.sumNullable(
          existing.batteryChargeKwh,
          record.batteryChargeKwh,
        );
        existing.batteryDischargeKwh = this.sumNullable(
          existing.batteryDischargeKwh,
          record.batteryDischargeKwh,
        );
        continue;
      }

      buckets.set(record.month, {
        systemId: record.systemId,
        year: record.year,
        month: record.month,
        pvGenerationKwh: this.roundAmount(record.pvGenerationKwh),
        loadConsumedKwh: record.loadConsumedKwh,
        gridImportedKwh: record.gridImportedKwh,
        gridExportedKwh: record.gridExportedKwh,
        batteryChargeKwh: record.batteryChargeKwh,
        batteryDischargeKwh: record.batteryDischargeKwh,
        raw: {
          source: 'AGGREGATED_DAILY',
          month: record.month,
        },
      });
    }

    const records = Array.from(buckets.values()).sort((left, right) => left.month - right.month);

    return {
      systemId: dailyHistory.systemId,
      year: dailyHistory.year,
      totalGenerationKwh: this.roundAmount(
        records.reduce((sum, record) => sum + record.pvGenerationKwh, 0),
      ),
      records,
      rejectedRecordCount: 0,
      rejectionReasons: [],
      dataQualityStatus: 'VERIFIED_HISTORY',
      raw: {
        source: 'DAILY_AGGREGATION',
        recordCount: dailyHistory.records.length,
      },
    };
  }

  private async createLog(
    connectionId: string,
    payload: {
      action: string;
      status: string;
      message: string;
      providerType?: string;
      context?: Record<string, unknown>;
    },
  ) {
    return this.prisma.solarmanSyncLog.create({
      data: {
        connectionId,
        providerType: payload.providerType || null,
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
      providerType?: string;
      errorCode?: string | null;
      syncedStations?: number;
      syncedMonths?: number;
      syncedBillings?: number;
      context?: Record<string, unknown>;
      responsePayload?: Record<string, unknown> | null;
    },
  ) {
    return this.prisma.solarmanSyncLog.update({
      where: { id },
      data: {
        providerType: payload.providerType || undefined,
        status: payload.status,
        errorCode: payload.errorCode || null,
        message: payload.message,
        syncedStations: payload.syncedStations ?? 0,
        syncedMonths: payload.syncedMonths ?? 0,
        syncedBillings: payload.syncedBillings ?? 0,
        context: payload.context as any,
        responsePayload: payload.responsePayload as any,
        finishedAt: new Date(),
      },
    });
  }

  private async ensureConnectionExists(id: string) {
    const exists = await this.prisma.solarmanConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('SOLARMAN connection not found');
    }
  }

  private async getConnectionOrThrow(id: string) {
    const connection = await this.prisma.solarmanConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.includeRelations(),
    });

    if (!connection) {
      throw new NotFoundException('SOLARMAN connection not found');
    }

    return connection;
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
        orderBy: { createdAt: 'desc' as const },
      },
      syncLogs: {
        orderBy: { createdAt: 'desc' as const },
        take: 12,
      },
      debugSnapshots: {
        orderBy: { capturedAt: 'desc' as const },
        take: 12,
      },
    };
  }

  private async ensureCustomerExists(customerId?: string) {
    if (!customerId) {
      return;
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new BadRequestException('Customer mapping not found');
    }
  }

  private toCredentials(connection: SolarmanConnectionWithRelations) {
    const providerType = this.normalizeProviderType(connection.providerType);
    const password = this.decrypt(connection.passwordEncrypted);

    if (providerType === 'WEB_OAUTH_REFRESH_TOKEN') {
      return {
        connectionId: connection.id,
        usernameOrEmail: connection.usernameOrEmail,
      };
    }

    if (!password) {
      throw new BadRequestException(
        'Không giải mã được mật khẩu SOLARMAN. Hãy lưu lại connection với mật khẩu mới.',
      );
    }

    return {
      connectionId: connection.id,
      usernameOrEmail: connection.usernameOrEmail,
      password,
    };
  }

  private serializeConnection(
    connection: SolarmanConnectionWithRelations,
    canViewSecrets = false,
  ) {
    const passwordEncrypted = connection.passwordEncrypted;
    const safeConnection = { ...connection };
    delete safeConnection.passwordEncrypted;
    delete safeConnection.accessToken;
    delete safeConnection.refreshToken;
    delete safeConnection.accessTokenEncrypted;
    delete safeConnection.refreshTokenEncrypted;
    delete safeConnection.cookieJar;
    delete safeConnection.cookieJarEncrypted;

    return {
      ...safeConnection,
      usernameOrEmail: canViewSecrets ? safeConnection.usernameOrEmail : null,
      defaultUnitPrice: toNumber(connection.defaultUnitPrice),
      defaultTaxAmount: toNumber(connection.defaultTaxAmount),
      defaultVatRate: toNumber(connection.defaultVatRate),
      defaultDiscountAmount: toNumber(connection.defaultDiscountAmount),
      providerType: this.normalizeProviderType(connection.providerType),
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString?.() || null,
      accessTokenExpiresAt: connection.accessTokenExpiresAt?.toISOString?.() || null,
      lastSuccessfulRefreshAt:
        connection.lastSuccessfulRefreshAt?.toISOString?.() || null,
      lastSuccessfulStationSyncAt:
        connection.lastSuccessfulStationSyncAt?.toISOString?.() || null,
      lastDiscoveredStationCount: connection.lastDiscoveredStationCount ?? null,
      lastRefreshErrorCode: connection.lastRefreshErrorCode || null,
      lastRefreshErrorMessage: connection.lastRefreshErrorMessage || null,
      reauthorizationRequiredAt:
        connection.reauthorizationRequiredAt?.toISOString?.() || null,
      lastErrorCode: connection.lastErrorCode || null,
      lastErrorMessage: connection.lastErrorMessage || null,
      hasStoredPassword: Boolean(passwordEncrypted),
      hasStoredRefreshToken: Boolean(connection.refreshTokenEncrypted),
      hasPersistedCookieSession: Boolean(connection.cookieJarEncrypted),
      statusSummary: this.buildStatusSummary(connection, Boolean(passwordEncrypted)),
      debugSnapshots:
        connection.debugSnapshots?.map((snapshot: any) => ({
          id: snapshot.id,
          stationId: snapshot.stationId || null,
          deviceSn: snapshot.deviceSn || null,
          providerType: snapshot.providerType,
          snapshotType: snapshot.snapshotType,
          status: snapshot.status,
          capturedAt: snapshot.capturedAt?.toISOString?.() || null,
          note: snapshot.note || null,
          payload: snapshot.payload || null,
        })) || [],
      systems:
        connection.systems?.map((system: any) => ({
          ...system,
          capacityKwp: toNumber(system.capacityKwp),
          installedCapacityKwp: toNumber(system.installedCapacityKwp),
          currentMonthGenerationKwh: toNumber(system.currentMonthGenerationKwh),
          currentYearGenerationKwh: toNumber(system.currentYearGenerationKwh),
          totalGenerationKwh: toNumber(system.totalGenerationKwh),
          currentGenerationPowerKw: toNumber(system.currentGenerationPowerKw),
          defaultUnitPrice: toNumber(system.defaultUnitPrice),
          defaultTaxAmount: toNumber(system.defaultTaxAmount),
          defaultVatRate: toNumber(system.defaultVatRate),
          defaultDiscountAmount: toNumber(system.defaultDiscountAmount),
        })) || [],
    };
  }

  private buildStatusSummary(
    connection: SolarmanConnectionWithRelations,
    hasStoredPassword: boolean,
  ) {
    const logs = Array.isArray(connection.syncLogs) ? connection.syncLogs : [];
    const systems = Array.isArray(connection.systems) ? connection.systems : [];
    const lastTest = logs.find((log: any) => log.action === 'TEST_CONNECTION') || null;
    const lastSync =
      logs.find((log: any) =>
        ['MANUAL_SYNC', 'SCHEDULED_SYNC', 'SYNC_STATIONS'].includes(log.action),
      ) || null;
    const lastFailure =
      logs.find((log: any) => ['ERROR', 'WARNING'].includes(log.status)) || null;
    const stationIds = new Set(
      systems
        .map((system: any) => system.stationId || system.monitoringPlantId || null)
        .filter(Boolean),
    );
    const providerType = this.normalizeProviderType(connection.providerType);
    const authorizationReady =
      providerType === 'WEB_OAUTH_REFRESH_TOKEN'
        ? Boolean(connection.refreshTokenEncrypted)
        : providerType === 'COOKIE_SESSION'
          ? Boolean(connection.cookieJarEncrypted)
          : hasStoredPassword;

    return {
      configured: Boolean(connection.usernameOrEmail && authorizationReady),
      customerLinked: Boolean(connection.customerId),
      mappedSystems: systems.length,
      mappedStations: stationIds.size,
      lastTestStatus: lastTest?.status || null,
      lastTestMessage: lastTest?.message || null,
      lastTestAt: lastTest?.finishedAt?.toISOString?.() || lastTest?.startedAt?.toISOString?.() || null,
      lastSyncStatus: lastSync?.status || null,
      lastSyncMessage: lastSync?.message || null,
      lastSyncAt:
        lastSync?.finishedAt?.toISOString?.() ||
        lastSync?.startedAt?.toISOString?.() ||
        connection.lastSyncTime?.toISOString?.() ||
        null,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString?.() || null,
      lastFailureMessage: lastFailure?.message || null,
      providerType,
      authBridgeReady: authorizationReady,
      authorizationReady,
      accessTokenExpiresAt: connection.accessTokenExpiresAt?.toISOString?.() || null,
      lastSuccessfulRefreshAt:
        connection.lastSuccessfulRefreshAt?.toISOString?.() || null,
      lastSuccessfulStationSyncAt:
        connection.lastSuccessfulStationSyncAt?.toISOString?.() || null,
      lastDiscoveredStationCount: connection.lastDiscoveredStationCount ?? null,
      lastRefreshErrorCode: connection.lastRefreshErrorCode || null,
      lastRefreshErrorMessage: connection.lastRefreshErrorMessage || null,
      reauthorizationRequiredAt:
        connection.reauthorizationRequiredAt?.toISOString?.() || null,
      authStatus:
        connection.status === 'ACTIVE' ? 'CONFIGURED' : connection.status || 'CONFIGURED',
      lastErrorCode: connection.lastErrorCode || null,
      lastErrorMessage: connection.lastErrorMessage || null,
      realtimeAvailable: false,
      realtimeMessage:
        'SOLARMAN dang o trang thai dang cap nhat. Giai doan hien tai uu tien van hanh manual-first va import thang, khong xem day la nguon realtime on dinh.',
    };
  }

  private restorePersistedSession(connection: SolarmanConnectionWithRelations): SolarmanPersistedSession | null {
    const providerType = this.normalizeProviderType(connection.providerType);
    if (providerType === 'WEB_OAUTH_REFRESH_TOKEN') {
      return null;
    }

    const cookieJar = connection.cookieJarEncrypted
      ? this.decrypt(connection.cookieJarEncrypted)
      : null;
    const accessToken =
      this.decrypt(connection.accessTokenEncrypted) || connection.accessToken || null;

    if (!cookieJar && !accessToken) {
      return null;
    }

    return {
      mode: providerType === 'OFFICIAL_OPENAPI' ? 'official' : 'web',
      token: accessToken,
      cookieJar,
      expiresAt: connection.accessTokenExpiresAt?.getTime?.() || null,
      authorizationScheme: providerType === 'OFFICIAL_OPENAPI' ? 'bearer' : 'raw',
      allowCookies: providerType === 'COOKIE_SESSION',
    };
  }

  private normalizeProviderType(providerType?: string | null): SolarmanProviderType {
    const normalized = (providerType || 'COOKIE_SESSION').trim().toUpperCase();
    if (normalized === 'OFFICIAL_OPENAPI') {
      return 'OFFICIAL_OPENAPI';
    }
    if (normalized === 'WEB_OAUTH_REFRESH_TOKEN') {
      return 'WEB_OAUTH_REFRESH_TOKEN';
    }
    if (normalized === 'MANUAL_IMPORT') {
      return 'MANUAL_IMPORT';
    }
    return 'COOKIE_SESSION';
  }

  private resolveErrorCode(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        const payload = response as Record<string, unknown>;
        if (typeof payload.code === 'string' && payload.code.trim()) {
          return payload.code.trim();
        }
        if (typeof payload.statusCode === 'number') {
          return `HTTP_${payload.statusCode}`;
        }
      }
      return `HTTP_${error.getStatus()}`;
    }

    if (error instanceof Error && error.name) {
      return error.name;
    }

    return 'UNKNOWN_ERROR';
  }

  private resolveConnectionStatusForError(error: unknown) {
    return this.resolveErrorCode(error) === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'ERROR';
  }

  private toErrorPayload(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        return response as Record<string, unknown>;
      }

      return {
        statusCode: error.getStatus(),
        message: typeof response === 'string' ? response : error.message,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      message: 'Unknown error',
    };
  }

  private sumNullable(left?: number | null, right?: number | null) {
    if (left === null || left === undefined) {
      return right ?? null;
    }

    if (right === null || right === undefined) {
      return left;
    }

    return this.roundAmount(left + right);
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

  private encrypt(value: string) {
    return encryptSolarmanSecret(value, this.configService);
  }

  private decrypt(value: string | null | undefined) {
    return decryptSolarmanSecret(value, this.configService);
  }

  private roundAmount(value: number) {
    return Number((value || 0).toFixed(2));
  }
}
