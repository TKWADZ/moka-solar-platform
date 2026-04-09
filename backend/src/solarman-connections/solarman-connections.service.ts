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
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { hasPermission } from '../common/auth/permissions';
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
  ParsedSolarmanMonthlyHistory,
  ParsedSolarmanMonthlyRecord,
  ParsedSolarmanStation,
} from './solarman.parser';
import { SolarmanClientService } from './solarman-client.service';

type SolarmanConnectionWithRelations = any;
type SolarSystemRecord = any;

@Injectable()
export class SolarmanConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolarmanConnectionsService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private syncInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly solarmanClientService: SolarmanClientService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
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

    const connection = await this.prisma.solarmanConnection.create({
      data: {
        accountName: dto.accountName.trim(),
        usernameOrEmail: dto.usernameOrEmail.trim(),
        passwordEncrypted: this.encrypt(dto.password),
        customerId: dto.customerId || null,
        defaultUnitPrice: dto.defaultUnitPrice ?? null,
        defaultTaxAmount: dto.defaultTaxAmount ?? null,
        defaultVatRate: deriveVatRateFromAmounts(100, dto.defaultTaxAmount, NaN) ?? null,
        defaultDiscountAmount: dto.defaultDiscountAmount ?? null,
        status: dto.status?.trim() || 'ACTIVE',
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

    const updated = await this.prisma.solarmanConnection.update({
      where: { id },
      data: {
        accountName: dto.accountName?.trim() ?? existing.accountName,
        usernameOrEmail: dto.usernameOrEmail?.trim() ?? existing.usernameOrEmail,
        passwordEncrypted: dto.password ? this.encrypt(dto.password) : existing.passwordEncrypted,
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
        status: dto.status?.trim() ?? existing.status,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
      },
      include: this.includeRelations(),
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLARMAN_CONNECTION_UPDATED',
      entityType: 'SolarmanConnection',
      entityId: id,
      payload: dto as Record<string, unknown>,
    });

    return this.serializeConnection(updated);
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

    const log = await this.createLog(connection.id, {
      action: 'TEST_CONNECTION',
      status: 'RUNNING',
      message: 'Đang kiểm tra đăng nhập SOLARMAN và lấy danh sách station.',
    });

    try {
      const result = await this.solarmanClientService.testConnection(credentials);

      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          accessToken: result.tokenPreview || null,
          cookieJar: result.cookieJar ? { raw: result.cookieJar } : null,
          status: 'ACTIVE',
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Kết nối thành công. Nhận ${result.stationCount} station từ SOLARMAN.`,
        context: {
          stationCount: result.stationCount,
        },
        syncedStations: result.stationCount,
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'SOLARMAN_CONNECTION_TESTED',
        entityType: 'SolarmanConnection',
        entityId: id,
        payload: {
          stationCount: result.stationCount,
        },
      });

      return {
        connection: await this.findOne(id),
        stations: result.stations,
      };
    } catch (error) {
      await this.prisma.solarmanConnection.update({
        where: { id },
        data: {
          status: 'ERROR',
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'Test connection that bai.'),
      });

      throw error;
    }
  }

  async syncNow(id: string, dto: SyncSolarmanConnectionDto, actorId?: string) {
    const connection = await this.getConnectionOrThrow(id);
    return this.syncSingleConnection(connection, dto, actorId, 'MANUAL_SYNC');
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
          status: 'ACTIVE',
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
    const syncYear = dto.year || new Date().getFullYear();
    const createMissingSystems = dto.createMissingSystems ?? true;

    const log = await this.createLog(connection.id, {
      action,
      status: 'RUNNING',
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
      const session = await this.solarmanClientService.login(credentials);
      const stations = await this.solarmanClientService.listStations(credentials);
      const selectedStationIds = new Set(dto.stationIds?.filter(Boolean) || []);
      const targetStations = selectedStationIds.size
        ? stations.filter((station) => selectedStationIds.has(station.stationId))
        : stations;

      const stationResults: Array<Record<string, unknown>> = [];

      for (const station of targetStations) {
        const stationResult = await this.syncStation({
          connection,
          credentials,
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
          accessToken: session.token,
          cookieJar: session.cookieJar ? { raw: session.cookieJar } : null,
          status: 'ACTIVE',
          lastSyncTime: new Date(),
        },
      });

      await this.finishLog(log.id, {
        status: 'SUCCESS',
        message: `Đồng bộ xong ${syncedStations} station, ${syncedMonths} record tháng và ${syncedBillings} billing record.`,
        syncedStations,
        syncedMonths,
        syncedBillings,
        context: {
          year: syncYear,
          stations: stationResults,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'SOLARMAN_CONNECTION_SYNCED',
        entityType: 'SolarmanConnection',
        entityId: connection.id,
        payload: {
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
          status: 'ERROR',
        },
      });

      await this.finishLog(log.id, {
        status: 'ERROR',
        message: this.formatErrorMessage(error, 'SOLARMAN sync that bai.'),
        syncedStations,
        syncedMonths,
        syncedBillings,
      });

      throw error;
    }
  }

  private async syncStation(params: {
    connection: SolarmanConnectionWithRelations;
    credentials: { usernameOrEmail: string; password: string };
    station: ParsedSolarmanStation;
    year: number;
    actorId?: string;
    createMissingSystems: boolean;
  }) {
    const { connection, credentials, station, year, actorId, createMissingSystems } = params;
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

    const monthlyHistory = await this.getMonthlyHistoryWithFallback(
      credentials,
      station,
      year,
    );

    let syncedMonths = 0;
    let syncedBillings = 0;

    for (const monthlyRecord of monthlyHistory.records) {
      const importResult = await this.upsertMonthlyRecord({
        connection,
        system,
        station,
        monthlyRecord,
        actorId,
      });
      syncedMonths += 1;
      syncedBillings += importResult.billingSynced ? 1 : 0;
    }

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        currentMonthGenerationKwh: station.generationMonthKwh ?? system.currentMonthGenerationKwh,
        currentYearGenerationKwh: station.generationYearKwh ?? system.currentYearGenerationKwh,
        totalGenerationKwh: station.generationTotalKwh ?? system.totalGenerationKwh,
        currentGenerationPowerKw: station.generationPowerKw ?? system.currentGenerationPowerKw,
        latestMonitorAt: station.lastUpdateTime ? new Date(station.lastUpdateTime) : system.latestMonitorAt,
      },
    });

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      systemId: system.id,
      systemName: system.name,
      stationSynced: true,
      syncedMonths,
      syncedBillings,
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
    const latestMonitorAt = station.lastUpdateTime ? new Date(station.lastUpdateTime) : null;

    if (existing) {
      return this.prisma.solarSystem.update({
        where: { id: existing.id },
        data: {
          stationId: station.stationId,
          stationName: station.stationName,
          sourceSystem: station.sourceSystem,
          hasBattery: station.hasBattery,
          timeZone: station.timezone,
          externalPayload: station.raw as any,
          installedCapacityKwp: station.installedCapacityKw,
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
          latestMonitorAt,
          currentMonthGenerationKwh: station.generationMonthKwh,
          currentYearGenerationKwh: station.generationYearKwh,
          totalGenerationKwh: station.generationTotalKwh,
          currentGenerationPowerKw: station.generationPowerKw,
        },
      });
    }

    if (!createMissingSystems || !connection.customerId) {
      return null;
    }

    return this.prisma.solarSystem.create({
      data: {
        customerId: connection.customerId,
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
        sourceSystem: station.sourceSystem,
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
        status: 'ACTIVE',
      },
    });
  }

  private async getMonthlyHistoryWithFallback(
    credentials: { usernameOrEmail: string; password: string },
    station: ParsedSolarmanStation,
    year: number,
  ): Promise<ParsedSolarmanMonthlyHistory> {
    try {
      return await this.solarmanClientService.getMonthlyGeneration(
        credentials,
        station.stationId,
        year,
      );
    } catch (error) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      if (year === currentYear && station.generationMonthKwh !== null) {
        return {
          systemId: station.stationId,
          year,
          totalGenerationKwh: station.generationYearKwh || station.generationMonthKwh || 0,
          records: [
            {
              systemId: station.stationId,
              year,
              month: currentMonth,
              pvGenerationKwh: station.generationMonthKwh || 0,
              raw: station.raw,
            },
          ],
          raw: {
            fallback: true,
            station,
          },
        };
      }

      throw error;
    }
  }

  private async upsertMonthlyRecord(params: {
    connection: SolarmanConnectionWithRelations;
    system: SolarSystemRecord;
    station: ParsedSolarmanStation;
    monthlyRecord: ParsedSolarmanMonthlyRecord;
    actorId?: string;
  }) {
    const { connection, system, station, monthlyRecord, actorId } = params;
    const pricing = await this.resolvePricingDefaults(connection, system, monthlyRecord);
    const subtotalAmount = this.roundAmount(monthlyRecord.pvGenerationKwh * pricing.unitPrice);
    const taxAmount = calculateVatAmount(subtotalAmount, pricing.vatRate);
    const totalAmount = this.roundAmount(subtotalAmount + taxAmount - pricing.discountAmount);

    const monthlyEnergyRecord = await this.prisma.monthlyEnergyRecord.upsert({
      where: {
        source_stationId_year_month: {
          source: 'SOLARMAN_MONTHLY',
          stationId: station.stationId,
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
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source: 'SOLARMAN_MONTHLY',
        syncTime: new Date(),
        rawPayload: monthlyRecord.raw as any,
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
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source: 'SOLARMAN_MONTHLY',
        syncTime: new Date(),
        rawPayload: monthlyRecord.raw as any,
        note: pricing.note,
      },
    });

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
          source: 'SOLARMAN_MONTHLY',
          note: pricing.note,
        },
        actorId,
      );
      billingSynced = true;
    } catch (error) {
      await this.prisma.solarmanSyncLog.create({
        data: {
          connectionId: connection.id,
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

  private async createLog(
    connectionId: string,
    payload: {
      action: string;
      status: string;
      message: string;
      context?: Record<string, unknown>;
    },
  ) {
    return this.prisma.solarmanSyncLog.create({
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
      syncedStations?: number;
      syncedMonths?: number;
      syncedBillings?: number;
      context?: Record<string, unknown>;
    },
  ) {
    return this.prisma.solarmanSyncLog.update({
      where: { id },
      data: {
        status: payload.status,
        message: payload.message,
        syncedStations: payload.syncedStations ?? 0,
        syncedMonths: payload.syncedMonths ?? 0,
        syncedBillings: payload.syncedBillings ?? 0,
        context: payload.context as any,
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
    const password = this.decrypt(connection.passwordEncrypted);

    if (!password) {
      throw new BadRequestException(
        'Không giải mã được mật khẩu SOLARMAN. Hãy lưu lại connection với mật khẩu mới.',
      );
    }

    return {
      usernameOrEmail: connection.usernameOrEmail,
      password,
    };
  }

  private serializeConnection(
    connection: SolarmanConnectionWithRelations,
    canViewSecrets = false,
  ) {
    const {
      passwordEncrypted,
      accessToken,
      refreshToken,
      cookieJar,
      ...safeConnection
    } = connection;

    return {
      ...safeConnection,
      usernameOrEmail: canViewSecrets ? safeConnection.usernameOrEmail : null,
      defaultUnitPrice: toNumber(connection.defaultUnitPrice),
      defaultTaxAmount: toNumber(connection.defaultTaxAmount),
      defaultVatRate: toNumber(connection.defaultVatRate),
      defaultDiscountAmount: toNumber(connection.defaultDiscountAmount),
      accessTokenPreview: canViewSecrets && accessToken
        ? `${String(accessToken).slice(0, 10)}...`
        : null,
      hasStoredPassword: Boolean(passwordEncrypted),
      statusSummary: this.buildStatusSummary(connection, Boolean(passwordEncrypted)),
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

    return {
      configured: Boolean(connection.usernameOrEmail && hasStoredPassword),
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
      lastFailureMessage: lastFailure?.message || null,
      realtimeAvailable: false,
      realtimeMessage:
        'SOLARMAN dang o trang thai dang cap nhat. Giai doan hien tai uu tien van hanh manual-first va import thang, khong xem day la nguon realtime on dinh.',
    };
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
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(value: string) {
    try {
      const [ivBase64, authTagBase64, payloadBase64] = value.split(':');

      if (!ivBase64 || !authTagBase64 || !payloadBase64) {
        return null;
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(ivBase64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadBase64, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  private getEncryptionKey() {
    const secret =
      this.configService.get<string>('SOLARMAN_SETTINGS_SECRET') ||
      this.configService.get<string>('AI_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-solarman-settings';

    return createHash('sha256').update(secret).digest();
  }

  private roundAmount(value: number) {
    return Number((value || 0).toFixed(2));
  }
}
