import { Injectable } from '@nestjs/common';
import { SolarmanProviderType } from './solarman-client.service';
import { SolarmanCookieSessionProvider } from './solarman-cookie-session.provider';
import { SolarmanManualImportProvider } from './solarman-manual-import.provider';
import { SolarmanOfficialOpenApiProvider } from './solarman-official-openapi.provider';
import { SolarmanProvider } from './solarman-provider.interface';

@Injectable()
export class SolarmanProviderRegistry {
  constructor(
    private readonly officialOpenApiProvider: SolarmanOfficialOpenApiProvider,
    private readonly cookieSessionProvider: SolarmanCookieSessionProvider,
    private readonly manualImportProvider: SolarmanManualImportProvider,
  ) {}

  resolve(providerType?: string | null): SolarmanProvider {
    switch ((providerType || 'COOKIE_SESSION').trim().toUpperCase()) {
      case 'OFFICIAL_OPENAPI':
        return this.officialOpenApiProvider;
      case 'MANUAL_IMPORT':
        return this.manualImportProvider;
      case 'COOKIE_SESSION':
      default:
        return this.cookieSessionProvider;
    }
  }

  normalize(providerType?: string | null): SolarmanProviderType {
    const resolved = this.resolve(providerType);
    return resolved.providerType;
  }
}
