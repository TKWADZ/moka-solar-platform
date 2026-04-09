import { SolarmanProviderType } from './solarman-client.service';
import {
  SolarmanProviderCredentials,
  SolarmanProviderHistoryBundle,
  SolarmanProviderRequestOptions,
  SolarmanProviderTestResult,
} from './solarman-provider.types';

export interface SolarmanProvider {
  readonly providerType: SolarmanProviderType;
  testConnection(
    credentials: SolarmanProviderCredentials,
    options?: SolarmanProviderRequestOptions,
  ): Promise<SolarmanProviderTestResult>;
  fetchHistoryBundle(
    credentials: SolarmanProviderCredentials,
    stationId: string,
    year: number,
    options?: SolarmanProviderRequestOptions,
  ): Promise<SolarmanProviderHistoryBundle>;
}
