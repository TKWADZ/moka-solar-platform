import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import { DISCOVERY_PROVIDERS } from '../provider-discovery/provider-plant-discovery.types';

export class ImportProviderPlantsDto {
  @IsIn(DISCOVERY_PROVIDERS)
  provider: (typeof DISCOVERY_PROVIDERS)[number];

  @IsString()
  connectionId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  externalPlantIds: string[];
}
