import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { generateCode, toNumber } from '../common/helpers/domain.helper';
import { PrismaService } from '../prisma/prisma.service';
import { DeyeApiService } from './deye-api.service';
import { DeyeAuthService } from './deye-auth.service';
import { ParsedDeyeStation, parseDeyeStationList } from './deye.parser';

type DeyeConnectionRecord = any;

@Injectable()
export class DeyeStationSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deyeApiService: DeyeApiService,
    private readonly deyeAuthService: DeyeAuthService,
  ) {}

  async previewStations(connectionInput: string | DeyeConnectionRecord) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const payload = await this.requestStationList(session.connection, session.authHeader);
      const stations = parseDeyeStationList(payload);

      return {
        connectionId: session.connection.id,
        stations,
      };
    });
  }

  async syncStations(connectionInput: string | DeyeConnectionRecord) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const payload = await this.requestStationList(session.connection, session.authHeader);
      const stations = parseDeyeStationList(payload);
      const syncedStations: Array<Record<string, unknown>> = [];

      for (const station of stations) {
        const system = await this.upsertSystem(session.connection, station);
        let syncedDevices = 0;

        for (const device of station.devices) {
          await this.prisma.device.upsert({
            where: {
              stationId_deviceSn: {
                stationId: station.stationId,
                deviceSn: device.deviceSn,
              },
            },
            update: {
              systemId: system.id,
              connectionId: session.connection.id,
              deviceId: device.deviceId,
              deviceType: device.deviceType,
              productId: device.productId,
              connectStatus: device.connectStatus,
              collectionTime:
                device.collectionTime !== null && device.collectionTime !== undefined
                  ? BigInt(Math.trunc(device.collectionTime))
                  : null,
              externalPayload: device.raw as any,
              deletedAt: null,
            },
            create: {
              systemId: system.id,
              connectionId: session.connection.id,
              stationId: station.stationId,
              deviceId: device.deviceId,
              deviceSn: device.deviceSn,
              deviceType: device.deviceType || 'UNKNOWN',
              productId: device.productId,
              connectStatus: device.connectStatus,
              collectionTime:
                device.collectionTime !== null && device.collectionTime !== undefined
                  ? BigInt(Math.trunc(device.collectionTime))
                  : null,
              externalPayload: device.raw as any,
            },
          });

          syncedDevices += 1;
        }

        syncedStations.push({
          stationId: station.stationId,
          stationName: station.stationName,
          systemId: system.id,
          systemName: system.name,
          syncedDevices,
        });
      }

      await this.prisma.deyeConnection.update({
        where: { id: session.connection.id },
        data: {
          lastSyncTime: new Date(),
          status: 'SYNCED',
          lastError: null,
        },
      });

      return {
        stations,
        syncedStations,
      };
    });
  }

  async syncStationToSystem(
    connectionInput: string | DeyeConnectionRecord,
    systemId: string,
    stationId: string,
  ) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const payload = await this.requestStationList(session.connection, session.authHeader);
      const stations = parseDeyeStationList(payload);
      const station = stations.find((item) => item.stationId === stationId);

      if (!station) {
        throw new BadRequestException(
          `Khong tim thay station ${stationId} trong tai khoan Deye nay.`,
        );
      }

      const targetSystem = await this.prisma.solarSystem.findFirst({
        where: {
          id: systemId,
          deletedAt: null,
        },
      });

      if (!targetSystem) {
        throw new BadRequestException('Khong tim thay he thong can gan station Deye.');
      }

      const conflict = await this.prisma.solarSystem.findFirst({
        where: {
          deletedAt: null,
          sourceSystem: 'DEYE',
          stationId: station.stationId,
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

      if (conflict) {
        throw new BadRequestException(
          `Station ${station.stationId} da duoc gan cho he thong ${conflict.name} (${conflict.systemCode}).`,
        );
      }

      const now = new Date();
      const nextCapacity = station.installedCapacityKw ?? toNumber(targetSystem.capacityKwp);
      const latestMonitorAt = station.lastUpdateTime ? new Date(station.lastUpdateTime) : now;
      const primaryDevice =
        station.devices.find((device) => (device.deviceType || '').toUpperCase().includes('INVERTER')) ||
        station.devices[0] ||
        null;

      const updatedSystem = await this.prisma.solarSystem.update({
        where: { id: systemId },
        data: {
          deyeConnectionId: session.connection.id,
          monitoringProvider: 'DEYE',
          monitoringPlantId: station.stationId,
          sourceSystem: 'DEYE',
          stationId: station.stationId,
          stationName: station.stationName || targetSystem.name,
          capacityKwp: nextCapacity,
          installedCapacityKwp: station.installedCapacityKw ?? nextCapacity,
          inverterBrand: targetSystem.inverterBrand || 'Deye',
          inverterModel:
            primaryDevice?.productId ||
            primaryDevice?.deviceType ||
            targetSystem.inverterModel,
          hasBattery: false,
          timeZone: station.timezone,
          location: station.locationAddress ?? targetSystem.location,
          locationAddress: station.locationAddress,
          latitude: station.latitude,
          longitude: station.longitude,
          gridInterconnectionType: station.gridInterconnectionType,
          stationType: station.stationType,
          ownerName: station.ownerName,
          startedAt: station.startedAt ? new Date(station.startedAt) : null,
          externalPayload: station.raw as any,
          currentMonthGenerationKwh: station.currentMonthGenerationKwh,
          currentYearGenerationKwh: station.currentYearGenerationKwh,
          totalGenerationKwh: station.totalGenerationKwh,
          currentGenerationPowerKw: station.currentGenerationPowerKw,
          latestMonitorSnapshot: {
            provider: 'DEYE',
            plantId: station.stationId,
            plantName: station.stationName,
            installedPowerKw: station.installedCapacityKw,
            currentPvKw: station.currentGenerationPowerKw,
            todayGeneratedKwh: null,
            totalGeneratedKwh: station.totalGenerationKwh,
            inverterSerial: primaryDevice?.deviceSn || null,
            deviceId: primaryDevice?.deviceId || null,
            deviceModel: primaryDevice?.productId || primaryDevice?.deviceType || null,
            fetchedAt: latestMonitorAt.toISOString(),
            raw: station.raw,
          } as any,
          latestMonitorAt,
          lastStationSyncAt: now,
        },
      });

      await this.prisma.device.updateMany({
        where: {
          systemId,
          deletedAt: null,
          NOT: {
            stationId: station.stationId,
          },
        },
        data: {
          deletedAt: now,
        },
      });

      const remoteSerials = station.devices.map((device) => device.deviceSn);
      if (remoteSerials.length) {
        await this.prisma.device.updateMany({
          where: {
            systemId,
            stationId: station.stationId,
            deletedAt: null,
            deviceSn: {
              notIn: remoteSerials,
            },
          },
          data: {
            deletedAt: now,
          },
        });
      }

      for (const device of station.devices) {
        await this.prisma.device.upsert({
          where: {
            stationId_deviceSn: {
              stationId: station.stationId,
              deviceSn: device.deviceSn,
            },
          },
          update: {
            systemId,
            connectionId: session.connection.id,
            deviceId: device.deviceId,
            deviceType: device.deviceType,
            productId: device.productId,
            connectStatus: device.connectStatus,
            collectionTime:
              device.collectionTime !== null && device.collectionTime !== undefined
                ? BigInt(Math.trunc(device.collectionTime))
                : null,
            externalPayload: device.raw as any,
            deletedAt: null,
          },
          create: {
            systemId,
            connectionId: session.connection.id,
            stationId: station.stationId,
            deviceId: device.deviceId,
            deviceSn: device.deviceSn,
            deviceType: device.deviceType || 'UNKNOWN',
            productId: device.productId,
            connectStatus: device.connectStatus,
            collectionTime:
              device.collectionTime !== null && device.collectionTime !== undefined
                ? BigInt(Math.trunc(device.collectionTime))
                : null,
            externalPayload: device.raw as any,
          },
        });
      }

      await this.prisma.deyeConnection.update({
        where: { id: session.connection.id },
        data: {
          lastSyncTime: now,
          status: 'SYNCED',
          lastError: null,
        },
      });

      return {
        systemId: updatedSystem.id,
        systemCode: updatedSystem.systemCode,
        stationId: station.stationId,
        stationName: station.stationName,
        syncedDevices: station.devices.length,
      };
    });
  }

  private async upsertSystem(connection: DeyeConnectionRecord, station: ParsedDeyeStation) {
    const existing = await this.prisma.solarSystem.findFirst({
      where: {
        deletedAt: null,
        sourceSystem: 'DEYE',
        stationId: station.stationId,
      },
    });

    const nextCapacity = station.installedCapacityKw ?? 0;
    const latestMonitorAt = station.lastUpdateTime ? new Date(station.lastUpdateTime) : null;
    const primaryDevice =
      station.devices.find((device) => (device.deviceType || '').toUpperCase().includes('INVERTER')) ||
      station.devices[0] ||
      null;
    const defaultCustomerPricing = existing?.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: existing.customerId,
            deletedAt: null,
          },
            select: {
              defaultUnitPrice: true,
              defaultVatRate: true,
              defaultTaxAmount: true,
              defaultDiscountAmount: true,
            },
        })
      : null;

    const sharedData = {
      stationId: station.stationId,
      stationName: station.stationName,
      sourceSystem: 'DEYE',
      installedCapacityKwp: station.installedCapacityKw,
      hasBattery: false,
      timeZone: station.timezone,
      location: station.locationAddress,
      locationAddress: station.locationAddress,
      latitude: station.latitude,
      longitude: station.longitude,
      gridInterconnectionType: station.gridInterconnectionType,
      stationType: station.stationType,
      ownerName: station.ownerName,
      startedAt: station.startedAt ? new Date(station.startedAt) : null,
      externalPayload: station.raw as any,
      deyeConnectionId: connection.id,
      currentMonthGenerationKwh: station.currentMonthGenerationKwh,
      currentYearGenerationKwh: station.currentYearGenerationKwh,
      totalGenerationKwh: station.totalGenerationKwh,
      currentGenerationPowerKw: station.currentGenerationPowerKw,
      latestMonitorSnapshot: {
        provider: 'DEYE',
        stationId: station.stationId,
        stationName: station.stationName,
        monthGenerationKwh: station.currentMonthGenerationKwh,
        yearGenerationKwh: station.currentYearGenerationKwh,
        totalGenerationKwh: station.totalGenerationKwh,
        generationPowerKw: station.currentGenerationPowerKw,
        lastUpdateTime: station.lastUpdateTime,
        inverterSerial: primaryDevice?.deviceSn || null,
        deviceId: primaryDevice?.deviceId || null,
        deviceModel: primaryDevice?.productId || primaryDevice?.deviceType || null,
        raw: station.raw,
      } as any,
      latestMonitorAt,
      lastStationSyncAt: new Date(),
    };

    if (existing) {
      return this.prisma.solarSystem.update({
        where: { id: existing.id },
        data: {
          ...sharedData,
          name: station.stationName || existing.name,
          systemType: station.stationType || existing.systemType,
          capacityKwp: toNumber(existing.capacityKwp) > 0 ? existing.capacityKwp : nextCapacity,
          inverterBrand: existing.inverterBrand || 'Deye',
          inverterModel:
            existing.inverterModel ||
            primaryDevice?.productId ||
            primaryDevice?.deviceType ||
            null,
          defaultUnitPrice:
            existing.defaultUnitPrice ??
            defaultCustomerPricing?.defaultUnitPrice ??
            null,
          defaultVatRate:
            existing.defaultVatRate ??
            defaultCustomerPricing?.defaultVatRate ??
            null,
          defaultTaxAmount:
            existing.defaultTaxAmount ??
            defaultCustomerPricing?.defaultTaxAmount ??
            null,
          defaultDiscountAmount:
            existing.defaultDiscountAmount ??
            defaultCustomerPricing?.defaultDiscountAmount ??
            null,
        },
      });
    }

    return this.prisma.solarSystem.create({
      data: {
        customerId: null,
        systemCode: generateCode('SYS-DEYE'),
        name: station.stationName || `Deye ${station.stationId}`,
        systemType: station.stationType || 'PV',
        capacityKwp: nextCapacity,
        installedCapacityKwp: station.installedCapacityKw,
        panelCount: 0,
        inverterBrand: 'Deye',
        inverterModel: primaryDevice?.productId || primaryDevice?.deviceType || null,
        status: 'ACTIVE',
        ...sharedData,
      },
    });
  }

  private async requestStationList(connection: DeyeConnectionRecord, authHeader: string) {
    const payload = (await this.deyeApiService.post(
      connection.baseUrl,
      '/v1.0/station/listWithDevice',
      {},
      {
        headers: {
          Authorization: authHeader,
        },
        description: 'Deye station list',
      },
    )) as Record<string, unknown>;

    this.ensureSuccess(payload, 'Lay danh sach station Deye that bai.');
    return payload;
  }

  private ensureSuccess(payload: Record<string, unknown>, fallback: string) {
    const success = payload.success === true || String(payload.code || '') === '1000000';
    if (!success) {
      throw new BadGatewayException({
        message: String(payload.msg || fallback),
        provider: 'DEYE',
        code: payload.code || null,
        requestId: payload.requestId || null,
      });
    }
  }
}
