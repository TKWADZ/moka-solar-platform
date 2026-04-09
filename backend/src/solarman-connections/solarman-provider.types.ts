import {
  ParsedSolarmanDailyHistory,
  ParsedSolarmanDevice,
  ParsedSolarmanMonthlyHistory,
  ParsedSolarmanStation,
} from './solarman.parser';
import {
  SolarmanPersistedSession,
  SolarmanProviderType,
} from './solarman-client.service';

export type SolarmanProviderCredentials = {
  usernameOrEmail: string;
  password: string;
};

export type SolarmanProviderRequestOptions = {
  persistedSession?: SolarmanPersistedSession | null;
  forceRelogin?: boolean;
};

export type SolarmanProviderTestResult = {
  providerType: SolarmanProviderType;
  mode: string;
  tokenPreview?: string | null;
  session?: SolarmanPersistedSession | null;
  stations: ParsedSolarmanStation[];
  sampleDevices: ParsedSolarmanDevice[];
  rawResponses: {
    plantList?: Record<string, unknown> | null;
    deviceList?: Record<string, unknown> | null;
  };
};

export type SolarmanProviderHistoryBundle = {
  providerType: SolarmanProviderType;
  mode: string;
  session?: SolarmanPersistedSession | null;
  station: ParsedSolarmanStation;
  devices: ParsedSolarmanDevice[];
  dailyHistory: ParsedSolarmanDailyHistory | null;
  monthlyHistory: ParsedSolarmanMonthlyHistory | null;
  rawResponses: {
    plantList?: Record<string, unknown> | null;
    deviceList?: Record<string, unknown> | null;
    dailyHistory?: Record<string, unknown> | null;
    monthlyHistory?: Record<string, unknown> | null;
  };
};
