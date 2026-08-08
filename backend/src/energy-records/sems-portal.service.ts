import { Injectable } from '@nestjs/common';
import { SemsPlusClientService } from '../sems-plus/sems-plus-client.service';
import { SemsSyncDto } from './dto/sems-sync.dto';
import {
  SemsPlusLegacySnapshot,
  mapSemsPlusToLegacySnapshot,
} from './sems-plus.mapper';

@Injectable()
export class SemsPortalService {
  constructor(private readonly semsPlusClient: SemsPlusClientService) {}

  async fetchMonitorSnapshot(dto: SemsSyncDto): Promise<SemsPlusLegacySnapshot> {
    const allowRequestCredentials =
      process.env.NODE_ENV !== 'production' &&
      process.env.SEMS_PLUS_ALLOW_REQUEST_CREDENTIALS === 'true';
    const portalUrl =
      allowRequestCredentials && dto.loginUrl
        ? new URL(dto.loginUrl).origin
        : undefined;
    const result = await this.semsPlusClient.fetchPlantData(dto.plantId, {
      account: allowRequestCredentials ? dto.account : undefined,
      password: allowRequestCredentials ? dto.password : undefined,
      portalUrl,
    });

    return mapSemsPlusToLegacySnapshot({
      plantId: result.plant.plantId,
      baseApi: result.baseApi,
      fullPlantList: result.fullPlantList,
      stationOverview: result.stationOverview,
      devices: [],
      realtimeEnergyFlow: null,
    });
  }
}
