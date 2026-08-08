import { Injectable } from '@nestjs/common';
import { DeyeStationSyncService } from '../../deye-connections/deye-station-sync.service';
import {
  DiscoveredPlant,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';

function toProviderTimestamp(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

@Injectable()
export class DeyePlantDiscoveryAdapter implements ProviderPlantDiscoveryAdapter {
  readonly provider = 'DEYE' as const;
  readonly capability = {
    provider: this.provider,
    discovery: 'AVAILABLE' as const,
    import: 'AVAILABLE' as const,
    message: 'Discover and import use the existing Deye station list client.',
  };

  constructor(private readonly stationSyncService: DeyeStationSyncService) {}

  async listPlants(connectionId: string): Promise<DiscoveredPlant[]> {
    const result = await this.stationSyncService.previewStations(connectionId);

    return result.stations.map((station) => ({
      provider: this.provider,
      connectionId,
      externalPlantId: station.stationId,
      externalPlantName: station.stationName,
      installedCapacityKwp: station.installedCapacityKw,
      location: station.locationAddress,
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone,
      status:
        station.devices.find((device) => device.connectStatus)?.connectStatus || null,
      currentPowerKw: station.currentGenerationPowerKw,
      todayGenerationKwh: null,
      monthGenerationKwh: station.currentMonthGenerationKwh,
      yearGenerationKwh: station.currentYearGenerationKwh,
      totalGenerationKwh: station.totalGenerationKwh,
      devices: station.devices.map((device) => ({
        externalDeviceId: device.deviceId,
        serialNumber: device.deviceSn,
        deviceType: device.deviceType,
        model: device.productId,
        status: device.connectStatus,
        providerUpdatedAt: toProviderTimestamp(device.collectionTime),
        rawPayload: device.raw,
      })),
      providerUpdatedAt: station.lastUpdateTime,
      rawPayload: station.raw,
    }));
  }
}
