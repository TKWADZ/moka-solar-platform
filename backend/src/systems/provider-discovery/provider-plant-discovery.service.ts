import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { generateCode } from '../../common/helpers/domain.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderDiscoveryRegistry } from './provider-discovery.registry';
import {
  DiscoveredDevice,
  DiscoveredPlant,
  DiscoveryProvider,
} from './provider-plant-discovery.types';

type ImportActor = { userId?: string };

@Injectable()
export class ProviderPlantDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderDiscoveryRegistry,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  capabilities() {
    return this.registry.listCapabilities();
  }

  async listConnections() {
    const [deye, solarman, luxPower] = await Promise.all([
      this.prisma.deyeConnection.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          accountName: true,
          companyName: true,
          status: true,
          lastSyncTime: true,
          lastError: true,
        },
        orderBy: { accountName: 'asc' },
      }),
      this.prisma.solarmanConnection.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          accountName: true,
          providerType: true,
          status: true,
          lastSuccessfulSyncAt: true,
          lastErrorMessage: true,
        },
        orderBy: { accountName: 'asc' },
      }),
      this.prisma.luxPowerConnection.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          accountName: true,
          status: true,
          lastSyncTime: true,
          lastError: true,
        },
        orderBy: { accountName: 'asc' },
      }),
    ]);

    return {
      capabilities: this.capabilities(),
      connections: [
        ...deye.map((item) => ({
          provider: 'DEYE' as const,
          id: item.id,
          name: item.companyName || item.accountName,
          status: item.status,
          lastSuccessfulSyncAt: item.lastSyncTime,
          lastError: item.lastError,
        })),
        ...solarman.map((item) => ({
          provider: 'SOLARMAN' as const,
          id: item.id,
          name: item.accountName,
          status: item.status,
          mode: item.providerType,
          lastSuccessfulSyncAt: item.lastSuccessfulSyncAt,
          lastError: item.lastErrorMessage,
        })),
        ...luxPower.map((item) => ({
          provider: 'LUXPOWER' as const,
          id: item.id,
          name: item.accountName,
          status: item.status,
          lastSuccessfulSyncAt: item.lastSyncTime,
          lastError: item.lastError,
        })),
      ],
    };
  }

  async discoverPlants(provider: DiscoveryProvider, connectionId: string) {
    const plants = await this.discoverRaw(provider, connectionId);
    const linked = await this.findLinkedSystems(provider, plants.map((plant) => plant.externalPlantId));

    return {
      provider,
      connectionId,
      capability: this.registry.resolve(provider).capability,
      plants: plants.map((plant) => {
        const exact = linked.filter(
          (system) => system.sourceSystem === provider && system.stationId === plant.externalPlantId,
        );
        const legacyConflicts = linked.filter(
          (system) =>
            system.stationId !== plant.externalPlantId &&
            system.monitoringPlantId === plant.externalPlantId,
        );
        const system = exact[0] || null;
        const importState = legacyConflicts.length
          ? 'CONFLICT'
          : system?.providerDisconnectedAt
            ? 'DISCONNECTED'
            : system?.customerId
              ? 'ASSIGNED'
              : system
                ? 'IMPORTED_UNASSIGNED'
                : 'NEW';

        return {
          ...this.toPublicPlant(plant),
          importState,
          linkedSystem: system
            ? {
                id: system.id,
                systemCode: system.systemCode,
                name: system.name,
                customerId: system.customerId,
              }
            : null,
          conflictSystems: legacyConflicts.map((item) => ({
            id: item.id,
            systemCode: item.systemCode,
            name: item.name,
          })),
        };
      }),
    };
  }

  async importPlants(
    provider: DiscoveryProvider,
    connectionId: string,
    externalPlantIds: string[],
    actor: ImportActor,
  ) {
    const allPlants = await this.discoverRaw(provider, connectionId);
    const requested = new Set(externalPlantIds.map((item) => item.trim()).filter(Boolean));
    const selected = allPlants.filter((plant) => requested.has(plant.externalPlantId));
    const missing = [...requested].filter(
      (plantId) => !allPlants.some((plant) => plant.externalPlantId === plantId),
    );

    if (missing.length) {
      throw new BadRequestException(
        `Provider did not return these plants: ${missing.join(', ')}. Refresh discovery before importing.`,
      );
    }

    const results: Array<Record<string, unknown>> = [];
    for (const plant of selected) {
      const result = await this.importPlant(plant);
      results.push(result);
      await this.auditLogsService.log({
        userId: actor.userId,
        action: result.created ? 'PROVIDER_PLANT_IMPORTED' : 'PROVIDER_PLANT_UPDATED',
        entityType: 'SolarSystem',
        entityId: String(result.systemId),
        payload: {
          provider,
          connectionId,
          externalPlantId: plant.externalPlantId,
          deviceCount: plant.devices.length,
        },
      });
    }

    const disconnected = await this.markMissingPlantsDisconnected(
      provider,
      connectionId,
      allPlants.map((plant) => plant.externalPlantId),
    );

    return {
      provider,
      connectionId,
      discovered: allPlants.length,
      imported: results.length,
      disconnected,
      results,
    };
  }

  async assignCustomer(systemId: string, customerId: string, actorId?: string) {
    const [system, customer] = await Promise.all([
      this.prisma.solarSystem.findFirst({
        where: { id: systemId, deletedAt: null },
        select: { id: true, customerId: true, systemCode: true, name: true },
      }),
      this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, customerCode: true },
      }),
    ]);

    if (!system) throw new NotFoundException('Solar system not found');
    if (!customer) throw new BadRequestException('Customer not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.solarSystem.update({
        where: { id: systemId },
        data: { customerId },
      });
      await tx.monthlyEnergyRecord.updateMany({
        where: { solarSystemId: systemId, deletedAt: null },
        data: { customerId },
      });
      return next;
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLAR_SYSTEM_CUSTOMER_ASSIGNED',
      entityType: 'SolarSystem',
      entityId: systemId,
      beforeState: { customerId: system.customerId },
      afterState: { customerId },
      payload: { customerCode: customer.customerCode },
    });

    return updated;
  }

  async linkImportedSystem(importedSystemId: string, targetSystemId: string, actorId?: string) {
    if (importedSystemId === targetSystemId) {
      throw new BadRequestException('Choose a different existing system to link.');
    }

    const [source, target] = await Promise.all([
      this.prisma.solarSystem.findFirst({
        where: { id: importedSystemId, deletedAt: null },
        include: {
          _count: { select: { contracts: true, monthlyPvBillings: true } },
        },
      }),
      this.prisma.solarSystem.findFirst({
        where: { id: targetSystemId, deletedAt: null },
      }),
    ]);

    if (!source || !target) throw new NotFoundException('Source or target system not found');
    if (!source.sourceSystem || source.sourceSystem === 'MANUAL' || !source.stationId) {
      throw new BadRequestException('The source must be an imported provider system.');
    }
    if (source._count.contracts || source._count.monthlyPvBillings) {
      throw new BadRequestException(
        'The imported source already has contracts or billing records. Review it manually before linking.',
      );
    }
    if (
      target.sourceSystem &&
      target.sourceSystem !== 'MANUAL' &&
      (target.sourceSystem !== source.sourceSystem || target.stationId !== source.stationId)
    ) {
      throw new BadRequestException('The target system is already linked to another provider plant.');
    }

    const duplicate = await this.prisma.solarSystem.findFirst({
      where: {
        deletedAt: null,
        sourceSystem: source.sourceSystem,
        stationId: source.stationId,
        id: { notIn: [source.id, target.id] },
      },
      select: { id: true, name: true, systemCode: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        `Plant is already linked to ${duplicate.name} (${duplicate.systemCode}).`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.device.updateMany({ where: { systemId: source.id }, data: { systemId: target.id } });
        await tx.deyeTelemetryRecord.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.deyeDailyRecord.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.energyRecord.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.monthlyEnergyRecord.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id, customerId: target.customerId } });
        await tx.systemRealtimeMetric.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.systemMonitorSyncLog.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.solarmanDebugSnapshot.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.luxPowerDebugSnapshot.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });
        await tx.luxPowerNormalizedMetric.updateMany({ where: { solarSystemId: source.id }, data: { solarSystemId: target.id } });

        await tx.solarSystem.update({
          where: { id: source.id },
          data: {
            sourceSystem: null,
            stationId: null,
            monitoringProvider: null,
            monitoringPlantId: null,
            deyeConnectionId: null,
            solarmanConnectionId: null,
            luxPowerDiscoveryConnectionId: null,
            deletedAt: new Date(),
            metadata: this.mergeMetadata(source.metadata, {
              mergedIntoSystemId: target.id,
              mergedAt: new Date().toISOString(),
            }),
          },
        });

        await tx.solarSystem.update({
          where: { id: target.id },
          data: {
            sourceSystem: source.sourceSystem,
            monitoringProvider: source.monitoringProvider || source.sourceSystem,
            stationId: source.stationId,
            monitoringPlantId: source.monitoringPlantId || source.stationId,
            stationName: source.stationName,
            installedCapacityKwp: source.installedCapacityKwp,
            timeZone: source.timeZone,
            locationAddress: source.locationAddress,
            latitude: source.latitude,
            longitude: source.longitude,
            hasBattery: source.hasBattery,
            externalPayload: source.externalPayload || undefined,
            latestMonitorSnapshot: source.latestMonitorSnapshot || undefined,
            latestMonitorAt: source.latestMonitorAt,
            currentMonthGenerationKwh: source.currentMonthGenerationKwh,
            currentYearGenerationKwh: source.currentYearGenerationKwh,
            totalGenerationKwh: source.totalGenerationKwh,
            currentGenerationPowerKw: source.currentGenerationPowerKw,
            deyeConnectionId: source.deyeConnectionId,
            solarmanConnectionId: source.solarmanConnectionId,
            luxPowerDiscoveryConnectionId: source.luxPowerDiscoveryConnectionId,
            providerLastSeenAt: source.providerLastSeenAt,
            providerDisconnectedAt: source.providerDisconnectedAt,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(
          'Linking would conflict with existing monitoring history. No data was changed.',
        );
      }
      throw error;
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'PROVIDER_PLANT_LINKED_TO_EXISTING_SYSTEM',
      entityType: 'SolarSystem',
      entityId: target.id,
      payload: {
        importedSystemId: source.id,
        provider: source.sourceSystem,
        externalPlantId: source.stationId,
      },
    });

    return { success: true, systemId: target.id, archivedImportedSystemId: source.id };
  }

  private async discoverRaw(provider: DiscoveryProvider, connectionId: string) {
    const normalizedConnectionId = connectionId.trim();
    if (!normalizedConnectionId) throw new BadRequestException('Connection is required.');
    return this.registry.resolve(provider).listPlants(normalizedConnectionId);
  }

  private async importPlant(plant: DiscoveredPlant) {
    const existing = await this.prisma.solarSystem.findFirst({
      where: {
        deletedAt: null,
        sourceSystem: plant.provider,
        stationId: plant.externalPlantId,
      },
    });
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const providerData = this.buildProviderData(plant, now);
      const system = await tx.solarSystem.upsert({
        where: {
          sourceSystem_stationId: {
            sourceSystem: plant.provider,
            stationId: plant.externalPlantId,
          },
        },
        update: providerData,
        create: {
          customerId: null,
          systemCode: generateCode(`SYS-${plant.provider.slice(0, 4)}`),
          name: plant.externalPlantName || `${plant.provider} ${plant.externalPlantId}`,
          systemType: 'PV',
          capacityKwp: plant.installedCapacityKwp ?? 0,
          panelCount: 0,
          status: 'ACTIVE',
          ...providerData,
        },
      });

      await this.upsertDevices(tx, system.id, plant);

      return {
        created: !existing,
        systemId: system.id,
        systemCode: system.systemCode,
        customerId: system.customerId,
        externalPlantId: plant.externalPlantId,
      };
    });
  }

  private buildProviderData(plant: DiscoveredPlant, now: Date) {
    const providerUpdatedAt = this.safeDate(plant.providerUpdatedAt);
    const data: Record<string, unknown> = {
      sourceSystem: plant.provider,
      monitoringProvider: plant.provider,
      stationId: plant.externalPlantId,
      monitoringPlantId: plant.externalPlantId,
      stationName: plant.externalPlantName ?? undefined,
      installedCapacityKwp: plant.installedCapacityKwp ?? undefined,
      timeZone: plant.timezone ?? undefined,
      locationAddress: plant.location ?? undefined,
      latitude: plant.latitude ?? undefined,
      longitude: plant.longitude ?? undefined,
      externalPayload: plant.rawPayload as Prisma.InputJsonValue,
      latestMonitorSnapshot: {
        provider: plant.provider,
        plantId: plant.externalPlantId,
        plantName: plant.externalPlantName,
        status: plant.status,
        currentPowerKw: plant.currentPowerKw,
        todayGenerationKwh: plant.todayGenerationKwh,
        monthGenerationKwh: plant.monthGenerationKwh,
        yearGenerationKwh: plant.yearGenerationKwh,
        totalGenerationKwh: plant.totalGenerationKwh,
        deviceCount: plant.devices.length,
        fetchedAt: now.toISOString(),
        providerUpdatedAt: providerUpdatedAt?.toISOString() || null,
      } as Prisma.InputJsonValue,
      latestMonitorAt: providerUpdatedAt ?? now,
      lastStationSyncAt: now,
      lastSyncAttemptAt: now,
      lastSuccessfulSyncAt: now,
      lastSyncStatus: 'SYNCED',
      lastSyncErrorStatus: null,
      lastSyncErrorMessage: null,
      lastSyncErrorAt: null,
      providerLastSeenAt: now,
      providerDisconnectedAt: null,
      ...this.connectionBinding(plant.provider, plant.connectionId),
    };

    if (plant.currentPowerKw !== null) data.currentGenerationPowerKw = plant.currentPowerKw;
    if (plant.monthGenerationKwh !== null) data.currentMonthGenerationKwh = plant.monthGenerationKwh;
    if (plant.yearGenerationKwh !== null) data.currentYearGenerationKwh = plant.yearGenerationKwh;
    if (plant.totalGenerationKwh !== null) data.totalGenerationKwh = plant.totalGenerationKwh;
    return data;
  }

  private connectionBinding(provider: DiscoveryProvider, connectionId: string) {
    if (provider === 'DEYE') return { deyeConnectionId: connectionId };
    if (provider === 'SOLARMAN') return { solarmanConnectionId: connectionId };
    if (provider === 'LUXPOWER') return { luxPowerDiscoveryConnectionId: connectionId };
    return {};
  }

  private async upsertDevices(
    tx: Prisma.TransactionClient,
    systemId: string,
    plant: DiscoveredPlant,
  ) {
    const validDevices = plant.devices.filter((device) => device.serialNumber.trim());
    if (validDevices.length) {
      await tx.device.updateMany({
        where: {
          systemId,
          stationId: plant.externalPlantId,
          deletedAt: null,
          deviceSn: { notIn: validDevices.map((device) => device.serialNumber) },
        },
        data: { deletedAt: new Date() },
      });
    }

    for (const device of validDevices) {
      await tx.device.upsert({
        where: {
          stationId_deviceSn: {
            stationId: plant.externalPlantId,
            deviceSn: device.serialNumber,
          },
        },
        update: this.deviceData(systemId, plant, device),
        create: {
          stationId: plant.externalPlantId,
          deviceSn: device.serialNumber,
          ...this.deviceData(systemId, plant, device),
        },
      });
    }
  }

  private deviceData(systemId: string, plant: DiscoveredPlant, device: DiscoveredDevice) {
    const updatedAt = this.safeDate(device.providerUpdatedAt);
    return {
      systemId,
      connectionId: plant.provider === 'DEYE' ? plant.connectionId : null,
      deviceId: device.externalDeviceId,
      deviceType: device.deviceType || 'UNKNOWN',
      productId: device.model,
      connectStatus: device.status,
      collectionTime: updatedAt ? BigInt(updatedAt.getTime()) : null,
      externalPayload: device.rawPayload as Prisma.InputJsonValue,
      deletedAt: null,
    };
  }

  private async markMissingPlantsDisconnected(
    provider: DiscoveryProvider,
    connectionId: string,
    remotePlantIds: string[],
  ) {
    if (provider === 'SEMS_PORTAL') return 0;
    const where: Prisma.SolarSystemWhereInput = {
      deletedAt: null,
      sourceSystem: provider,
      ...this.connectionWhere(provider, connectionId),
      ...(remotePlantIds.length ? { stationId: { notIn: remotePlantIds } } : {}),
    };
    const now = new Date();
    const result = await this.prisma.solarSystem.updateMany({
      where,
      data: {
        providerDisconnectedAt: now,
        lastSyncStatus: 'DISCONNECTED',
        lastSyncErrorStatus: 'PROVIDER_PLANT_MISSING',
        lastSyncErrorMessage:
          'Plant was not returned by the latest successful provider discovery.',
        lastSyncErrorAt: now,
      },
    });
    return result.count;
  }

  private connectionWhere(provider: DiscoveryProvider, connectionId: string) {
    if (provider === 'DEYE') return { deyeConnectionId: connectionId };
    if (provider === 'SOLARMAN') return { solarmanConnectionId: connectionId };
    if (provider === 'LUXPOWER') return { luxPowerDiscoveryConnectionId: connectionId };
    return {};
  }

  private async findLinkedSystems(provider: DiscoveryProvider, plantIds: string[]) {
    if (!plantIds.length) return [];
    return this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
        OR: [
          { sourceSystem: provider, stationId: { in: plantIds } },
          { monitoringProvider: provider, monitoringPlantId: { in: plantIds } },
        ],
      },
      select: {
        id: true,
        systemCode: true,
        name: true,
        customerId: true,
        sourceSystem: true,
        stationId: true,
        monitoringPlantId: true,
        providerDisconnectedAt: true,
      },
    });
  }

  private toPublicPlant(plant: DiscoveredPlant) {
    return {
      provider: plant.provider,
      connectionId: plant.connectionId,
      externalPlantId: plant.externalPlantId,
      externalPlantName: plant.externalPlantName,
      installedCapacityKwp: plant.installedCapacityKwp,
      location: plant.location,
      latitude: plant.latitude,
      longitude: plant.longitude,
      timezone: plant.timezone,
      status: plant.status,
      currentPowerKw: plant.currentPowerKw,
      todayGenerationKwh: plant.todayGenerationKwh,
      monthGenerationKwh: plant.monthGenerationKwh,
      yearGenerationKwh: plant.yearGenerationKwh,
      totalGenerationKwh: plant.totalGenerationKwh,
      providerUpdatedAt: plant.providerUpdatedAt,
      devices: plant.devices.map((device) => ({
        externalDeviceId: device.externalDeviceId,
        serialNumber: device.serialNumber,
        deviceType: device.deviceType,
        model: device.model,
        status: device.status,
        providerUpdatedAt: device.providerUpdatedAt,
      })),
    };
  }

  private safeDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private mergeMetadata(current: unknown, next: Record<string, unknown>) {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    return { ...base, ...next } as Prisma.InputJsonValue;
  }
}
