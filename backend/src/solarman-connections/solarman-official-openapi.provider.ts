import { Injectable } from '@nestjs/common';
import { SolarmanClientService } from './solarman-client.service';
import { SolarmanProvider } from './solarman-provider.interface';
import {
  SolarmanProviderCredentials,
  SolarmanProviderHistoryBundle,
  SolarmanProviderRequestOptions,
  SolarmanProviderTestResult,
} from './solarman-provider.types';

@Injectable()
export class SolarmanOfficialOpenApiProvider implements SolarmanProvider {
  readonly providerType = 'OFFICIAL_OPENAPI' as const;

  constructor(private readonly solarmanClientService: SolarmanClientService) {}

  async testConnection(
    credentials: SolarmanProviderCredentials,
    options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderTestResult> {
    const result = await this.solarmanClientService.testConnection(credentials, {
      ...options,
      mode: 'official',
    });

    return {
      providerType: this.providerType,
      mode: result.mode,
      tokenPreview: result.tokenPreview,
      session: {
        mode: 'official',
        token: result.tokenPreview || null,
        cookieJar: result.cookieJar || null,
      },
      stations: result.stations,
      sampleDevices: result.sampleDevices || [],
      rawResponses: result.rawResponses,
    };
  }

  async fetchHistoryBundle(
    credentials: SolarmanProviderCredentials,
    stationId: string,
    year: number,
    options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderHistoryBundle> {
    const stationList = await this.solarmanClientService.listStationsDetailed(credentials, {
      ...options,
      mode: 'official',
    });
    const station =
      stationList.stations.find((item) => item.stationId === stationId) || stationList.stations[0];
    if (!station) {
      throw new Error('Khong tim thay plant/station SOLARMAN trong official API provider.');
    }

    const deviceList = await this.solarmanClientService.listDevicesDetailed(credentials, station.stationId, {
      ...options,
      mode: 'official',
      persistedSession: stationList.session,
    });
    const dailyHistory = await this.solarmanClientService.getDailyGenerationDetailed(
      credentials,
      station.stationId,
      year,
      {
        ...options,
        mode: 'official',
        persistedSession: deviceList.session,
      },
    );
    const monthlyHistory = await this.solarmanClientService.getMonthlyGenerationDetailed(
      credentials,
      station.stationId,
      year,
      {
        ...options,
        mode: 'official',
        persistedSession: dailyHistory.session,
      },
    );

    return {
      providerType: this.providerType,
      mode: 'official',
      session: {
        mode: 'official',
        token: monthlyHistory.session.token || null,
        cookieJar: monthlyHistory.session.cookieJar || null,
      },
      station,
      devices: deviceList.devices,
      dailyHistory: dailyHistory.history,
      monthlyHistory: monthlyHistory.history,
      rawResponses: {
        plantList: stationList.raw,
        deviceList: deviceList.raw,
        dailyHistory: dailyHistory.raw,
        monthlyHistory: monthlyHistory.raw,
      },
    };
  }
}
