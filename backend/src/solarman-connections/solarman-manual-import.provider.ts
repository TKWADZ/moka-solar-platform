import { BadRequestException, Injectable } from '@nestjs/common';
import { SolarmanProvider } from './solarman-provider.interface';
import {
  SolarmanProviderCredentials,
  SolarmanProviderHistoryBundle,
  SolarmanProviderRequestOptions,
  SolarmanProviderTestResult,
} from './solarman-provider.types';

@Injectable()
export class SolarmanManualImportProvider implements SolarmanProvider {
  readonly providerType = 'MANUAL_IMPORT' as const;

  async testConnection(
    _credentials: SolarmanProviderCredentials,
    _options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderTestResult> {
    throw new BadRequestException(
      'MANUAL_IMPORT khong co dang nhap cloud. Hay dung manual override/import khi sync provider chua day du.',
    );
  }

  async fetchHistoryBundle(
    _credentials: SolarmanProviderCredentials,
    _stationId: string,
    _year: number,
    _options: SolarmanProviderRequestOptions = {},
  ): Promise<SolarmanProviderHistoryBundle> {
    throw new BadRequestException(
      'MANUAL_IMPORT khong tu fetch cloud data. Hay dung manual override kWh trong billing khi can.',
    );
  }
}
