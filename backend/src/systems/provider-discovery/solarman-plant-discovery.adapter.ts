import { Injectable } from '@nestjs/common';
import { SolarmanConnectionsService } from '../../solarman-connections/solarman-connections.service';
import {
  DiscoveredDevice,
  DiscoveredPlant,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';

@Injectable()
export class SolarmanPlantDiscoveryAdapter implements ProviderPlantDiscoveryAdapter {
  readonly provider = 'SOLARMAN' as const;
  readonly capability = {
    provider: this.provider,
    discovery: 'AVAILABLE' as const,
    import: 'AVAILABLE' as const,
    message: 'Discovery reuses the configured SOLARMAN provider implementation.',
  };

  constructor(private readonly connectionsService: SolarmanConnectionsService) {}

  async listPlants(connectionId: string): Promise<DiscoveredPlant[]> {
    const result = await this.connectionsService.discoverPlants(connectionId);
    const sharedDevices: DiscoveredDevice[] =
      result.stations.length === 1
        ? result.sampleDevices
            .filter((device) => Boolean(device.serialNumber))
            .map((device) => ({
              externalDeviceId: device.deviceId,
              serialNumber: device.serialNumber!,
              deviceType: device.deviceType,
              model: device.deviceModel,
              status: device.status,
              providerUpdatedAt: null,
              rawPayload: device.raw,
            }))
        : [];

    return result.stations.map((station) => ({
      provider: this.provider,
      connectionId,
      externalPlantId: station.stationId,
      externalPlantName: station.stationName,
      installedCapacityKwp: station.installedCapacityKw,
      location: null,
      latitude: null,
      longitude: null,
      timezone: station.timezone,
      status: null,
      currentPowerKw: station.generationPowerKw,
      todayGenerationKwh: null,
      monthGenerationKwh: station.generationMonthKwh,
      yearGenerationKwh: station.generationYearKwh,
      totalGenerationKwh: station.generationTotalKwh,
      devices: sharedDevices,
      providerUpdatedAt: station.lastUpdateTime,
      rawPayload: station.raw,
    }));
  }
}
