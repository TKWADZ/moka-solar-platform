import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { ReportSystemDashboardPresenceDto } from './dto/report-system-dashboard-presence.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { generateCode } from '../common/helpers/domain.helper';
import { normalizePercentRate } from '../common/helpers/billing.helper';
import { DeyeHistorySyncService } from '../deye-connections/deye-history-sync.service';
import { DeyeStationSyncService } from '../deye-connections/deye-station-sync.service';
import { DeyeTelemetrySyncService } from '../deye-connections/deye-telemetry-sync.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { deriveSystemStatusFromMonitoring } from './system-status.util';

@Injectable()
export class SystemsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private readonly deyeHistorySyncService: DeyeHistorySyncService,
    private readonly deyeStationSyncService: DeyeStationSyncService,
    private readonly deyeTelemetrySyncService: DeyeTelemetrySyncService,
  ) {}

  findAll() {
    return this.prisma.solarSystem
      .findMany({
      where: { deletedAt: null },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        devices: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'desc' }],
        },
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 7,
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 24,
        },
        luxPowerConnection: {
          select: {
            id: true,
            accountName: true,
            status: true,
          },
        },
        monitorSyncLogs: {
          orderBy: [{ createdAt: 'desc' }],
          take: 8,
        },
      },
      orderBy: { createdAt: 'desc' },
      })
      .then((systems) => systems.map((system) => this.serializeSystem(system)));
  }

  findMine(customerId: string) {
    return this.prisma.solarSystem
      .findMany({
      where: {
        customerId,
        deletedAt: null,
      },
      include: {
        devices: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'desc' }],
        },
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 30,
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 24,
        },
        contracts: {
          where: { deletedAt: null },
          include: {
            servicePackage: true,
          },
        },
        luxPowerConnection: {
          select: {
            id: true,
            accountName: true,
            status: true,
          },
        },
        monitorSyncLogs: {
          orderBy: [{ createdAt: 'desc' }],
          take: 8,
        },
      },
      orderBy: { createdAt: 'desc' },
      })
      .then((systems) => systems.map((system) => this.serializeSystem(system)));
  }

  async findOne(id: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        devices: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'desc' }],
        },
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 30,
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 24,
        },
        contracts: {
          where: { deletedAt: null },
          include: {
            servicePackage: true,
          },
        },
        luxPowerConnection: {
          select: {
            id: true,
            accountName: true,
            status: true,
          },
        },
        monitorSyncLogs: {
          orderBy: [{ createdAt: 'desc' }],
          take: 8,
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Solar system not found');
    }

    return this.serializeSystem(system);
  }

  async reportDashboardPresence(dto: ReportSystemDashboardPresenceDto, actor: AuthenticatedUser) {
    if (actor.role === 'CUSTOMER' && !actor.customerId) {
      return { accepted: 0 };
    }

    const uniqueSystemIds = [...new Set((dto.systemIds || []).map((item) => item.trim()).filter(Boolean))];
    if (!uniqueSystemIds.length) {
      return { accepted: 0 };
    }

    const accessibleSystems = await this.prisma.solarSystem.findMany({
      where: {
        id: { in: uniqueSystemIds },
        deletedAt: null,
        ...(actor.role === 'CUSTOMER' && actor.customerId
          ? {
              customerId: actor.customerId,
            }
          : {}),
      },
      select: { id: true },
    });

    const allowedIds = accessibleSystems.map((item) => item.id);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 75 * 1000);
    const pageKey = dto.pageKey?.trim() || 'system-dashboard';

    await Promise.all(
      allowedIds.map((systemId) =>
        this.prisma.systemDashboardPresence.upsert({
          where: {
            solarSystemId_userId_pageKey: {
              solarSystemId: systemId,
              userId: actor.sub,
              pageKey,
            },
          },
          update: {
            roleCode: actor.role,
            lastSeenAt: now,
            expiresAt,
          },
          create: {
            solarSystemId: systemId,
            userId: actor.sub,
            pageKey,
            roleCode: actor.role,
            lastSeenAt: now,
            expiresAt,
          },
        }),
      ),
    );

    return {
      accepted: allowedIds.length,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async create(dto: CreateSystemDto, actorId?: string) {
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : null;

    await this.ensureCustomerExists(dto.customerId);
    await this.ensureSystemCodeAvailable(dto.systemCode);

    const system = await this.prisma.solarSystem.create({
      data: {
        customerId: dto.customerId,
        systemCode: dto.systemCode || generateCode('SYS'),
        name: dto.name,
        systemType: dto.systemType,
        capacityKwp: dto.capacityKwp,
        installedCapacityKwp: dto.capacityKwp,
        panelCount: dto.panelCount,
        panelBrand: dto.panelBrand,
        panelModel: dto.panelModel,
        inverterBrand: dto.inverterBrand,
        inverterModel: dto.inverterModel,
        monitoringProvider: dto.monitoringProvider,
        monitoringPlantId: dto.monitoringPlantId,
        stationId: dto.stationId,
        stationName: dto.stationName,
        sourceSystem: dto.sourceSystem,
        defaultUnitPrice: dto.defaultUnitPrice,
        defaultVatRate: normalizedVatRate,
        defaultTaxAmount: dto.defaultTaxAmount,
        defaultDiscountAmount: dto.defaultDiscountAmount,
        installDate: dto.installDate ? new Date(dto.installDate) : undefined,
        location: dto.location,
        notes: dto.notes,
        status: dto.status || 'ACTIVE',
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 7,
        },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLAR_SYSTEM_CREATED',
      entityType: 'SolarSystem',
      entityId: system.id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return this.serializeSystem(system);
  }

  async update(id: string, dto: UpdateSystemDto, actorId?: string) {
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : undefined;

    const current = await this.findOne(id);

    if (dto.customerId && dto.customerId !== current.customerId) {
      await this.ensureCustomerExists(dto.customerId);
    }

    if (dto.systemCode && dto.systemCode !== current.systemCode) {
      await this.ensureSystemCodeAvailable(dto.systemCode, id);
    }

    const updated = await this.prisma.solarSystem.update({
      where: { id },
      data: {
        customerId:
          dto.customerId === undefined ? current.customerId : dto.customerId || null,
        systemCode: dto.systemCode,
        name: dto.name,
        systemType: dto.systemType,
        capacityKwp: dto.capacityKwp ?? undefined,
        installedCapacityKwp: dto.capacityKwp ?? undefined,
        panelCount: dto.panelCount,
        panelBrand: dto.panelBrand,
        panelModel: dto.panelModel,
        inverterBrand: dto.inverterBrand,
        inverterModel: dto.inverterModel,
        monitoringProvider: dto.monitoringProvider,
        monitoringPlantId: dto.monitoringPlantId,
        stationId: dto.stationId,
        stationName: dto.stationName,
        sourceSystem: dto.sourceSystem,
        defaultUnitPrice: dto.defaultUnitPrice,
        defaultVatRate: normalizedVatRate,
        defaultTaxAmount: dto.defaultTaxAmount,
        defaultDiscountAmount: dto.defaultDiscountAmount,
        installDate: dto.installDate ? new Date(dto.installDate) : undefined,
        location: dto.location,
        notes: dto.notes,
        status: dto.status,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        devices: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'desc' }],
        },
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 7,
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 24,
        },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLAR_SYSTEM_UPDATED',
      entityType: 'SolarSystem',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return this.serializeSystem(updated);
  }

  async remove(id: string, actorId?: string) {
    await this.findOne(id);

    await this.prisma.solarSystem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLAR_SYSTEM_ARCHIVED',
      entityType: 'SolarSystem',
      entityId: id,
    });

    return { success: true };
  }

  async previewDeyeStations(systemId: string, connectionId: string) {
    await this.findOne(systemId);
    const connection = await this.prisma.deyeConnection.findFirst({
      where: {
        id: connectionId,
        deletedAt: null,
      },
      select: {
        id: true,
        accountName: true,
        companyName: true,
        status: true,
        lastSyncTime: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('Deye connection not found');
    }

    const preview = await this.deyeStationSyncService.previewStations(connectionId);
    const stationIds = preview.stations.map((station) => station.stationId);
    const linkedSystems = stationIds.length
      ? await this.prisma.solarSystem.findMany({
          where: {
            deletedAt: null,
            sourceSystem: 'DEYE',
            stationId: {
              in: stationIds,
            },
          },
          select: {
            id: true,
            name: true,
            systemCode: true,
            stationId: true,
          },
        })
      : [];

    return {
      connection,
      stations: preview.stations.map((station) => {
        const linkedSystem =
          linkedSystems.find((item) => item.stationId === station.stationId) || null;

        return {
          stationId: station.stationId,
          stationName: station.stationName,
          installedCapacityKw: station.installedCapacityKw,
          locationAddress: station.locationAddress,
          timezone: station.timezone,
          gridInterconnectionType: station.gridInterconnectionType,
          stationType: station.stationType,
          ownerName: station.ownerName,
          currentMonthGenerationKwh: station.currentMonthGenerationKwh,
          currentYearGenerationKwh: station.currentYearGenerationKwh,
          totalGenerationKwh: station.totalGenerationKwh,
          currentGenerationPowerKw: station.currentGenerationPowerKw,
          lastUpdateTime: station.lastUpdateTime,
          deviceCount: station.devices.length,
          devices: station.devices,
          linkedSystem,
        };
      }),
    };
  }

  async syncDeyeStation(systemId: string, connectionId: string, stationId: string, actorId?: string) {
    const result = await this.deyeStationSyncService.syncStationToSystem(
      connectionId,
      systemId,
      stationId,
    );
    let monitoringData: Record<string, unknown> | null = null;
    const syncYear = new Date().getFullYear();
    let monthlyHistory: Record<string, unknown> | null = null;

    try {
      monitoringData = await this.deyeTelemetrySyncService.syncSystemOperationalData(
        connectionId,
        systemId,
        {
          stationId,
        },
      );
    } catch (error) {
      monitoringData = {
        telemetryRecords: 0,
        dailyRecords: 0,
        error:
          error instanceof Error
            ? error.message
            : 'Khong the dong bo du lieu realtime/ngay Deye ngay sau khi gan station.',
      };
    }

    try {
      monthlyHistory = await this.deyeHistorySyncService.syncMonthlyHistory(connectionId, {
        actorId,
        year: syncYear,
        stationIds: [stationId],
      });
    } catch (error) {
      monthlyHistory = {
        year: syncYear,
        syncedMonths: 0,
        syncedBillings: 0,
        error:
          error instanceof Error
            ? error.message
            : 'Khong the dong bo lich su PV thang ngay sau khi gan station Deye.',
      };
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLAR_SYSTEM_DEYE_SYNCED',
      entityType: 'SolarSystem',
      entityId: systemId,
      payload: {
        connectionId,
        stationId,
        syncedDevices: result.syncedDevices,
      },
    });

    return {
      ...result,
      monitoringData,
      monthlyHistory,
      system: await this.findOne(systemId),
    };
  }

  private async ensureCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }
  }

  private async ensureSystemCodeAvailable(systemCode?: string, currentId?: string) {
    if (!systemCode) {
      return;
    }

    const existing = await this.prisma.solarSystem.findFirst({
      where: {
        systemCode,
        deletedAt: null,
        ...(currentId
          ? {
              NOT: {
                id: currentId,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('System code already exists');
    }
  }

  private serializeSystem(system: any) {
    const binding = this.buildMonitorBinding(system);

    return {
      ...system,
      capacityKwp: Number(system.capacityKwp || 0),
      installedCapacityKwp:
        system.installedCapacityKwp !== null && system.installedCapacityKwp !== undefined
          ? Number(system.installedCapacityKwp)
          : null,
      currentMonthGenerationKwh:
        system.currentMonthGenerationKwh !== null && system.currentMonthGenerationKwh !== undefined
          ? Number(system.currentMonthGenerationKwh)
          : null,
      currentYearGenerationKwh:
        system.currentYearGenerationKwh !== null && system.currentYearGenerationKwh !== undefined
          ? Number(system.currentYearGenerationKwh)
          : null,
      totalGenerationKwh:
        system.totalGenerationKwh !== null && system.totalGenerationKwh !== undefined
          ? Number(system.totalGenerationKwh)
          : null,
      currentGenerationPowerKw:
        system.currentGenerationPowerKw !== null && system.currentGenerationPowerKw !== undefined
          ? Number(system.currentGenerationPowerKw)
          : null,
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
      latitude:
        system.latitude !== null && system.latitude !== undefined
          ? Number(system.latitude)
          : null,
      longitude:
        system.longitude !== null && system.longitude !== undefined
          ? Number(system.longitude)
          : null,
      devices:
        system.devices?.map((device: any) => ({
          ...device,
          collectionTime:
            device.collectionTime !== null && device.collectionTime !== undefined
              ? Number(device.collectionTime)
              : null,
        })) || [],
      status:
        deriveSystemStatusFromMonitoring({
          currentStatus: system.status,
          connectionStatus:
            system.latestMonitorSnapshot &&
            typeof system.latestMonitorSnapshot === 'object' &&
            !Array.isArray(system.latestMonitorSnapshot)
              ? String(
                  (system.latestMonitorSnapshot as Record<string, unknown>).connectionStatus ||
                    (system.latestMonitorSnapshot as Record<string, unknown>).inverterStatus ||
                    '',
                )
              : null,
          latestTelemetryAt: system.lastRealtimeSyncAt || system.latestMonitorAt || null,
        }) || system.status,
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
      energyRecords:
        system.energyRecords?.map((record: any) => ({
          ...record,
          solarGeneratedKwh:
            record.solarGeneratedKwh !== null && record.solarGeneratedKwh !== undefined
              ? Number(record.solarGeneratedKwh)
              : null,
          loadConsumedKwh:
            record.loadConsumedKwh !== null && record.loadConsumedKwh !== undefined
              ? Number(record.loadConsumedKwh)
              : null,
          gridImportedKwh:
            record.gridImportedKwh !== null && record.gridImportedKwh !== undefined
              ? Number(record.gridImportedKwh)
              : null,
          gridExportedKwh:
            record.gridExportedKwh !== null && record.gridExportedKwh !== undefined
              ? Number(record.gridExportedKwh)
              : null,
            })) || [],
      lastSyncAttemptAt: system.lastSyncAttemptAt?.toISOString?.() || system.lastSyncAttemptAt || null,
      lastSuccessfulSyncAt:
        system.lastSuccessfulSyncAt?.toISOString?.() || system.lastSuccessfulSyncAt || null,
      lastSyncErrorAt: system.lastSyncErrorAt?.toISOString?.() || system.lastSyncErrorAt || null,
      nextRealtimeSyncAt:
        system.nextRealtimeSyncAt?.toISOString?.() || system.nextRealtimeSyncAt || null,
      nextHistorySyncAt: system.nextHistorySyncAt?.toISOString?.() || system.nextHistorySyncAt || null,
      monitorBindingReady: binding.ready,
      monitorBindingMessage: binding.message,
      monitorSyncLogs:
        system.monitorSyncLogs?.map((log: any) => ({
          id: log.id,
          provider: log.provider,
          syncScope: log.syncScope,
          scheduleTier: log.scheduleTier,
          status: log.status,
          message: log.message,
          errorStatus: log.errorStatus,
          errorCode: log.errorCode,
          errorMessage: log.errorMessage,
          startedAt: log.startedAt?.toISOString?.() || log.startedAt,
          finishedAt: log.finishedAt?.toISOString?.() || log.finishedAt || null,
          createdAt: log.createdAt?.toISOString?.() || log.createdAt,
          context: log.context || null,
        })) || [],
    };
  }

  private buildMonitorBinding(system: any) {
    const provider = String(system.sourceSystem || system.monitoringProvider || '').trim().toUpperCase();

    if (!provider) {
      return {
        ready: false,
        message: 'Chua cau hinh nguon monitor cho he thong nay.',
      };
    }

    if (provider === 'SEMS_PORTAL') {
      return system.monitoringPlantId || system.stationId
        ? { ready: true, message: null }
        : {
            ready: false,
            message: 'Can nhap plant ID SEMS truoc khi bat auto sync.',
          };
    }

    if (provider === 'SOLARMAN') {
      return system.solarmanConnectionId && (system.monitoringPlantId || system.stationId)
        ? { ready: true, message: null }
        : {
            ready: false,
            message: 'Can gan SOLARMAN connection va station ID truoc khi bat auto sync.',
          };
    }

    if (provider === 'DEYE') {
      return system.deyeConnectionId && system.stationId
        ? { ready: true, message: null }
        : {
            ready: false,
            message: 'Can gan Deye connection va station ID truoc khi bat auto sync.',
          };
    }

    if (provider === 'LUXPOWER') {
      return system.luxPowerConnection?.id
        ? { ready: true, message: null }
        : {
            ready: false,
            message: 'Chua cau hinh LuxPower connection cho he thong nay.',
          };
    }

    return {
      ready: false,
      message: 'He thong chua co binding monitor hop le cho auto sync.',
    };
  }
}
