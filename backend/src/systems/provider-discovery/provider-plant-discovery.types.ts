export const DISCOVERY_PROVIDERS = [
  'DEYE',
  'SOLARMAN',
  'LUXPOWER',
  'SEMS_PORTAL',
] as const;

export type DiscoveryProvider = (typeof DISCOVERY_PROVIDERS)[number];

export type ProviderDiscoveryCapability = {
  provider: DiscoveryProvider;
  discovery: 'AVAILABLE' | 'UNAVAILABLE';
  import: 'AVAILABLE' | 'MANUAL_BINDING_ONLY' | 'UNAVAILABLE';
  message: string;
  missingRequirements?: string[];
};

export type DiscoveredDevice = {
  externalDeviceId: string | null;
  serialNumber: string;
  deviceType: string | null;
  model: string | null;
  status: string | null;
  providerUpdatedAt: string | null;
  rawPayload: Record<string, unknown>;
};

export type DiscoveredPlant = {
  provider: DiscoveryProvider;
  connectionId: string;
  externalPlantId: string;
  externalPlantName: string | null;
  installedCapacityKwp: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  status: string | null;
  currentPowerKw: number | null;
  todayGenerationKwh: number | null;
  monthGenerationKwh: number | null;
  yearGenerationKwh: number | null;
  totalGenerationKwh: number | null;
  devices: DiscoveredDevice[];
  providerUpdatedAt: string | null;
  rawPayload: Record<string, unknown>;
};

export interface ProviderPlantDiscoveryAdapter {
  readonly provider: DiscoveryProvider;
  readonly capability: ProviderDiscoveryCapability;
  listPlants(connectionId: string): Promise<DiscoveredPlant[]>;
}
