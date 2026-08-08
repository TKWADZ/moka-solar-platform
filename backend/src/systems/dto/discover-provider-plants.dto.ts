import { IsIn, IsString } from 'class-validator';
import { DISCOVERY_PROVIDERS } from '../provider-discovery/provider-plant-discovery.types';

export class DiscoverProviderPlantsDto {
  @IsIn(DISCOVERY_PROVIDERS)
  provider: (typeof DISCOVERY_PROVIDERS)[number];

  @IsString()
  connectionId: string;
}
