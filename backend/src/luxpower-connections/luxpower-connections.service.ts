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
import { decryptSecret, encryptSecret } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { deriveSystemStatusFromMonitoring } from '../systems/system-status.util';
import { CreateLuxPowerConnectionDto } from './dto/create-luxpower-connection.dto';
import { SyncLuxPowerConnectionDto } from './dto/sync-luxpower-connection.dto';
import { UpdateLuxPowerConnectionDto } from './dto/update-luxpower-connection.dto';
import {
  LuxPowerConnectionConfig,
  LuxPowerClientService,
} from './luxpower-client.service';
import { LuxPowerSnapshot } from './luxpower.parser';

type LuxPowerConnectionRecord = any;
type SolarSystemRecord = any;

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
    return connections.map((connection) => this.serializeConnection(connection, canViewSecrets));
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const connection = await this.getConnectionOrThrow(id);
    return this.serializeConnection(
      connection,
      hasPermission(actor?.permissions, 'integration.secrets.view'),
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
    await this.ensureSystemExists(dto.solarSystemId);
    this.assertCredentialMode(dto.useDemoMode, dto.username, dto.password);

    const connection = await this.prisma.luxPowerConnection.create({
      data: {
        accountName: dto.accountName.trim(),
        username: dto.username?.trim() || null,
        passwordEncrypted: dto.password?.trim()
          ? encryptSecret(dto.password.trim(), this.getEncryptionSecret())
          : null,
        plantId: dto.plantId?.trim() || null,
        inverterSerial: dto.inverterSerial?.trim() || null,
        solarSystemId: dto.solarSystemId?.trim() || null,
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
        solarSystemId: connection.solarSystemId,
        useDemoMode: connection.useDemoMode,
      },
    });

    return this.serializeConnection(connection);
  }

  async update(id: string, dto: UpdateLuxPowerConnectionDto, actorId?: string) {
    const existing = await this.getConnectionOrThrow(id);
    await this.ensureSystemExists(dto.solarSystemId);

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
        solarSystemId:
          dto.solarSystemId === undefined
            ? existing.solarSystemId
            : dto.solarSystemId?.trim() || null,
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
        solarSystemId: updated.solarSystemId,
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

      await this.prisma.luxPowerConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ACTIVE',
          lastLoginAt: result.sessionMode === 'LOGIN' ? new Date() : connection.lastLoginAt,
          lastError: null,
          lastProviderResponse: result.snapshot as any,
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `LuxPower ${result.sessionMode === 'DEMO' ? 'demo' : 'login'} OK. Da lay duoc snapshot monitor.`,
        context: {
          sessionMode: result.sessionMode,
          warnings: result.resolvedTarget.warnings,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
        },
        responsePayload: result.snapshot.raw as any,
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
        warnings: result.resolvedTarget.warnings,
        plants: result.resolvedTarget.plants,
        inverters: result.resolvedTarget.inverters,
        snapshot: result.snapshot,
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

  async syncNow(id: string, dto: SyncLuxPowerConnectionDto, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    return this.syncSingleConnection(connection, dto, actorId, 'MANUAL_SYNC');
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

      let updatedSystem = null;
      let systemUpdated = false;

      if (connection.solarSystemId) {
        updatedSystem = await this.applySnapshotToSystem(
          connection.solarSystemId,
          result.snapshot,
        );
        systemUpdated = true;
      }

      await this.prisma.luxPowerConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ACTIVE',
          lastLoginAt: result.sessionMode === 'LOGIN' ? new Date() : connection.lastLoginAt,
          lastSyncTime: new Date(),
          lastError: null,
          lastProviderResponse: result.snapshot as any,
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: systemUpdated
          ? 'Da lay snapshot LuxPower va cap nhat vao system da lien ket.'
          : 'Da lay snapshot LuxPower. Chua cap nhat vao system vi connection chua duoc map.',
        context: {
          sessionMode: result.sessionMode,
          warnings: result.resolvedTarget.warnings,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
          systemUpdated,
        },
        responsePayload: result.snapshot.raw as any,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'LUXPOWER_CONNECTION_SYNCED',
        entityType: 'LuxPowerConnection',
        entityId: connection.id,
        payload: {
          sessionMode: result.sessionMode,
          systemUpdated,
          solarSystemId: connection.solarSystemId,
          plantId: result.snapshot.plantId,
          serialNumber: result.snapshot.serialNumber,
        },
      });

      return {
        connection: await this.findOne(connection.id),
        snapshot: result.snapshot,
        warnings: result.resolvedTarget.warnings,
        sessionMode: result.sessionMode,
        systemUpdated,
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

  private async applySnapshotToSystem(systemId: string, snapshot: LuxPowerSnapshot) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
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
    const connectionStatus = this.normalizeConnectionStatus(
      snapshot.inverterStatus,
      snapshot.runtimeRecordedAt ? new Date(snapshot.runtimeRecordedAt) : syncTime,
    );

    return this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        monitoringProvider: 'LUXPOWER',
        monitoringPlantId: snapshot.plantId || snapshot.serialNumber,
        sourceSystem: 'LUXPOWER',
        stationId: snapshot.plantId || system.stationId,
        stationName: snapshot.plantName || system.stationName || system.name,
        inverterBrand: system.inverterBrand || 'LuxPower',
        currentGenerationPowerKw:
          snapshot.currentPvKw ?? system.currentGenerationPowerKw,
        totalGenerationKwh: snapshot.totalGenerationKwh ?? system.totalGenerationKwh,
        latestMonitorAt: syncTime,
        lastRealtimeSyncAt: syncTime,
        lastHourlySyncAt: snapshot.daySeries.length ? syncTime : system.lastHourlySyncAt,
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
          baseApi:
            this.configService.get<string>('LUXPOWER_BASE_URL') ||
            'https://server.luxpowertek.com/WManage',
          currentPvKw: snapshot.currentPvKw,
          batterySocPct: snapshot.batterySocPct,
          batteryPowerKw: snapshot.batteryPowerKw,
          loadPowerKw: snapshot.loadPowerKw,
          gridImportKw: snapshot.gridImportKw,
          gridExportKw: snapshot.gridExportKw,
          todayGeneratedKwh: snapshot.todayGenerationKwh,
          totalGeneratedKwh: snapshot.totalGenerationKwh,
          todayLoadConsumedKwh: snapshot.loadPowerKw,
          inverterStatus: snapshot.inverterStatus,
          inverterSerial: snapshot.serialNumber,
          fetchedAt: snapshot.fetchedAt,
          lastRealtimeSyncAt: syncTime.toISOString(),
          lastHourlySyncAt: snapshot.daySeries.length
            ? syncTime.toISOString()
            : existingSnapshot.lastHourlySyncAt || null,
          connectionStatus,
          dataScopes: {
            station: Boolean(snapshot.plantId || snapshot.serialNumber),
            realtime: true,
            hourly: snapshot.daySeries.length > 0,
            daily: false,
            monthly: false,
          },
          raw: snapshot.raw,
        } as any,
      },
    });
  }

  private serializeConnection(
    connection: LuxPowerConnectionRecord,
    canViewSecrets = false,
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

    return {
      ...safeConnection,
      username: canViewSecrets ? safeConnection.username : null,
      hasStoredPassword: Boolean(passwordEncrypted),
      statusSummary: {
        configured: Boolean(connection.useDemoMode || (connection.username && passwordEncrypted)),
        linkedSystem: Boolean(connection.solarSystemId),
        mode: connection.useDemoMode ? 'DEMO' : 'LOGIN',
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
        lastFailureMessage: lastFailure?.message || connection.lastError || null,
      },
      solarSystem: connection.solarSystem ? this.serializeSystem(connection.solarSystem) : null,
    };
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
      syncLogs: {
        orderBy: { createdAt: 'desc' as const },
        take: 12,
      },
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

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
