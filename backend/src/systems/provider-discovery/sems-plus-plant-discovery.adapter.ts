import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DiscoveredPlant,
  ProviderPlantDiscoveryAdapter,
} from './provider-plant-discovery.types';

const MISSING_SEMS_REQUESTS = [
  'Sanitized login/session request and response headers (without cookies or tokens)',
  'Sanitized account-level plant-list request and response body',
  'Sanitized device-list request for one plant',
  'Sanitized realtime and historical generation requests for one plant',
];

@Injectable()
export class SemsPlusPlantDiscoveryAdapter implements ProviderPlantDiscoveryAdapter {
  readonly provider = 'SEMS_PORTAL' as const;
  readonly capability = {
    provider: this.provider,
    discovery: 'UNAVAILABLE' as const,
    import: 'UNAVAILABLE' as const,
    message:
      'SEMS+ account discovery is disabled until the real sanitized request contract is available.',
    missingRequirements: MISSING_SEMS_REQUESTS,
  };

  async listPlants(_connectionId: string): Promise<DiscoveredPlant[]> {
    throw new BadRequestException({
      message: this.capability.message,
      provider: this.provider,
      missingRequirements: MISSING_SEMS_REQUESTS,
    });
  }
}
