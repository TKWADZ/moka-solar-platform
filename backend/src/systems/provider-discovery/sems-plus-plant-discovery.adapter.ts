import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SEMS_PLUS_ENV_CONNECTION_ID,
  SemsPlusClientService,
} from '../../sems-plus/sems-plus-client.service';
import {
  DiscoveredPlant,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';

const MISSING_CONFIGURATION = [
  'SEMS_PLUS_ACCOUNT',
  'SEMS_PLUS_PASSWORD',
];

@Injectable()
export class SemsPlusPlantDiscoveryAdapter implements ProviderPlantDiscoveryAdapter {
  readonly provider = 'SEMS_PORTAL' as const;

  constructor(private readonly client: SemsPlusClientService) {}

  get capability() {
    const available = this.client.hasConfiguredCredentials();
    return {
      provider: this.provider,
      discovery: available ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
      import: available ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
      message: available
        ? 'Discovery uses the current read-only GoodWe SEMS+ plant list and detail contract.'
        : 'Configure SEMS+ credentials on the backend to enable account discovery.',
      historicalDataCapability: 'UNVERIFIED' as const,
      monthlyHistoryAvailable: false,
      historyMessage: 'SEMS+ chưa có dữ liệu lịch sử tháng được xác minh.',
      ...(available ? {} : { missingRequirements: MISSING_CONFIGURATION }),
    };
  }

  async listConnections() {
    const summary = this.client.connectionSummary();
    return summary ? [summary] : [];
  }

  async listPlants(connectionId: string): Promise<DiscoveredPlant[]> {
    if (connectionId !== SEMS_PLUS_ENV_CONNECTION_ID) {
      throw new BadRequestException('Unknown SEMS+ server-side connection.');
    }

    const result = await this.client.discoverPlants();
    return result.plants.map((plant) => ({
      provider: this.provider,
      connectionId,
      externalPlantId: plant.plantId,
      externalPlantName: plant.plantName,
      installedCapacityKwp: plant.installedCapacityKwp,
      location: plant.location,
      latitude: plant.latitude,
      longitude: plant.longitude,
      timezone: plant.timezone,
      status: plant.status,
      // pSystem is intentionally not mapped until its unit is verified by a sanitized fixture.
      currentPowerKw: null,
      todayGenerationKwh: plant.todayGenerationKwh,
      monthGenerationKwh: null,
      yearGenerationKwh: null,
      totalGenerationKwh: plant.totalGenerationKwh,
      devices: [],
      providerUpdatedAt: plant.providerUpdatedAt,
      rawPayload: plant.raw,
    }));
  }
}
