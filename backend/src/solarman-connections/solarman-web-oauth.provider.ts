import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { SolarmanClientService, SolarmanPersistedSession } from './solarman-client.service';
import { SolarmanProvider } from './solarman-provider.interface';
import {
  SolarmanProviderCredentials,
  SolarmanProviderHistoryBundle,
  SolarmanProviderRequestOptions,
  SolarmanProviderTestResult,
} from './solarman-provider.types';
import { SolarmanWebOAuthTokenService } from './solarman-web-oauth-token.service';

@Injectable()
export class SolarmanWebOAuthProvider implements SolarmanProvider {
  readonly providerType = 'WEB_OAUTH_REFRESH_TOKEN' as const;

  constructor(
    private readonly solarmanClientService: SolarmanClientService,
    private readonly tokenService: SolarmanWebOAuthTokenService,
  ) {}

  async testConnection(
    credentials: SolarmanProviderCredentials,
    _options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderTestResult> {
    const connectionId = this.requireConnectionId(credentials);
    return this.withTokenRetry(connectionId, async (session) => {
      const result = await this.solarmanClientService.testConnection(credentials, {
        mode: 'web',
        persistedSession: session,
      });

      return {
        providerType: this.providerType,
        mode: 'web',
        session: this.withoutCookies(result.session),
        stations: result.stations,
        sampleDevices: result.sampleDevices || [],
        rawResponses: result.rawResponses,
      };
    });
  }

  async fetchHistoryBundle(
    credentials: SolarmanProviderCredentials,
    stationId: string,
    year: number,
    _options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderHistoryBundle> {
    const connectionId = this.requireConnectionId(credentials);
    return this.withTokenRetry(connectionId, async (session) => {
      const stationList = await this.solarmanClientService.listStationsDetailed(credentials, {
        mode: 'web',
        persistedSession: session,
      });
      const station =
        stationList.stations.find((item) => item.stationId === stationId) ||
        stationList.stations[0];
      if (!station) {
        throw new Error('Khong tim thay plant/station SOLARMAN trong web OAuth provider.');
      }

      const deviceList = await this.solarmanClientService.listDevicesDetailed(
        credentials,
        station.stationId,
        {
          mode: 'web',
          persistedSession: this.withoutCookies(stationList.session),
        },
      );
      const dailyHistory = await this.solarmanClientService.getDailyGenerationDetailed(
        credentials,
        station.stationId,
        year,
        {
          mode: 'web',
          persistedSession: this.withoutCookies(deviceList.session),
        },
      );
      const monthlyHistory = await this.solarmanClientService.getMonthlyGenerationDetailed(
        credentials,
        station.stationId,
        year,
        {
          mode: 'web',
          persistedSession: this.withoutCookies(dailyHistory.session),
          timezone: station.timezone,
        },
      );

      return {
        providerType: this.providerType,
        mode: 'web',
        session: this.withoutCookies(monthlyHistory.session),
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
    });
  }

  private async withTokenRetry<T>(
    connectionId: string,
    operation: (session: SolarmanPersistedSession) => Promise<T>,
  ) {
    const session = await this.tokenService.getValidSession(connectionId);
    try {
      return await operation(session);
    } catch (error) {
      if (!this.isAuthRequired(error)) {
        throw error;
      }

      const refreshed = await this.tokenService.refreshAfterRejection(
        connectionId,
        session.token,
      );
      return operation(refreshed);
    }
  }

  private requireConnectionId(credentials: SolarmanProviderCredentials) {
    if (!credentials.connectionId) {
      throw new BadRequestException('SOLARMAN connection id is required for web OAuth.');
    }
    return credentials.connectionId;
  }

  private withoutCookies(
    session: SolarmanPersistedSession | null | undefined,
  ): SolarmanPersistedSession {
    return {
      mode: 'web',
      token: session?.token || null,
      expiresAt: session?.expiresAt || null,
      cookieJar: null,
      authorizationScheme: 'bearer',
      allowCookies: false,
    };
  }

  private isAuthRequired(error: unknown) {
    if (!(error instanceof HttpException)) {
      return false;
    }
    const response = error.getResponse();
    return Boolean(
      response &&
        typeof response === 'object' &&
        (response as Record<string, unknown>).code === 'AUTH_REQUIRED',
    );
  }
}
