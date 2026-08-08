import { Injectable } from '@nestjs/common';
import { LuxPowerConnectionsService } from '../../luxpower-connections/luxpower-connections.service';
import {
  DiscoveredPlant,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';

function parseCapacityKwp(value: string | null) {
  if (!value) return null;
  const match = value.replace(',', '.').match(/([0-9.]+)\s*(kw|w)?/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  return String(match[2] || '').toLowerCase() === 'w' ? numeric / 1000 : numeric;
}

@Injectable()
export class LuxPowerPlantDiscoveryAdapter implements ProviderPlantDiscoveryAdapter {
  readonly provider = 'LUXPOWER' as const;
  readonly capability = {
    provider: this.provider,
    discovery: 'AVAILABLE' as const,
    import: 'MANUAL_BINDING_ONLY' as const,
    message:
      'All plants can be imported. Existing LuxPower billing sync still requires an explicit plant/system binding.',
  };

  constructor(private readonly connectionsService: LuxPowerConnectionsService) {}

  async listPlants(connectionId: string): Promise<DiscoveredPlant[]> {
    const result = await this.connectionsService.discoverPlants(connectionId);

    return result.plants.map((plant) => {
      const primary = plant.inverters[0] || null;
      const updatedTimes = plant.inverters
        .map((item) => item.lastUpdateTime)
        .filter((item): item is string => Boolean(item))
        .sort();

      return {
        provider: this.provider,
        connectionId,
        externalPlantId: plant.plantId,
        externalPlantName: plant.plantName,
        installedCapacityKwp: parseCapacityKwp(primary?.powerRatingText || null),
        location: null,
        latitude: null,
        longitude: null,
        timezone: null,
        status: primary?.statusText || null,
        currentPowerKw: null,
        todayGenerationKwh: null,
        monthGenerationKwh: null,
        yearGenerationKwh: null,
        totalGenerationKwh: null,
        devices: plant.inverters.map((device) => ({
          externalDeviceId: device.serialNumber,
          serialNumber: device.serialNumber,
          deviceType: device.deviceType,
          model: device.model,
          status: device.statusText,
          providerUpdatedAt: device.lastUpdateTime,
          rawPayload: device.raw,
        })),
        providerUpdatedAt: updatedTimes.at(-1) || plant.createdAt,
        rawPayload: {
          ...plant.rawPayload,
          warning: plant.warning,
        },
      };
    });
  }
}
