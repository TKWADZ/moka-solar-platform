import { BadRequestException, Injectable } from '@nestjs/common';
import { DeyePlantDiscoveryAdapter } from './deye-plant-discovery.adapter';
import { LuxPowerPlantDiscoveryAdapter } from './luxpower-plant-discovery.adapter';
import {
  DiscoveryProvider,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';
import { SemsPlusPlantDiscoveryAdapter } from './sems-plus-plant-discovery.adapter';
import { SolarmanPlantDiscoveryAdapter } from './solarman-plant-discovery.adapter';

@Injectable()
export class ProviderDiscoveryRegistry {
  private readonly adapters: ProviderPlantDiscoveryAdapter[];

  constructor(
    deye: DeyePlantDiscoveryAdapter,
    solarman: SolarmanPlantDiscoveryAdapter,
    luxPower: LuxPowerPlantDiscoveryAdapter,
    semsPlus: SemsPlusPlantDiscoveryAdapter,
  ) {
    this.adapters = [deye, solarman, luxPower, semsPlus];
  }

  listCapabilities() {
    return this.adapters.map((adapter) => adapter.capability);
  }

  async listConnections() {
    const groups = await Promise.all(
      this.adapters.map((adapter) => adapter.listConnections?.() || Promise.resolve([])),
    );
    return groups.flat();
  }

  resolve(provider: DiscoveryProvider) {
    const adapter = this.adapters.find((candidate) => candidate.provider === provider);
    if (!adapter) {
      throw new BadRequestException(`Provider ${provider} does not support plant discovery.`);
    }
    return adapter;
  }
}
