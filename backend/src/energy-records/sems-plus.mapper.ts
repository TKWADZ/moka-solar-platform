import { parseSemsPlusLocalizedNumber } from './sems-plus-visible-report.mapper';

export type SemsPlusRecord = Record<string, unknown>;

export type SemsPlusLegacyMapperInput = {
  plantId: string;
  baseApi: string;
  fullPlantList: SemsPlusRecord[];
  stationOverview: SemsPlusRecord[];
  devices?: SemsPlusRecord[];
  realtimeEnergyFlow?: SemsPlusRecord | null;
  fetchedAt?: Date | string;
};

export type SemsPlusLegacySnapshot = {
  provider: 'SEMS_PORTAL';
  plantId: string;
  plantName: string | null;
  baseApi: string;
  currentPvKw: number | null;
  batterySocPct: number | null;
  todayGeneratedKwh: number | null;
  totalGeneratedKwh: number | null;
  todayLoadConsumedKwh: number | null;
  todayGridImportedKwh: number | null;
  todayGridExportedKwh: number | null;
  inverterSerial: string | null;
  inverterStatus: string | null;
  fetchedAt: string;
  raw: {
    plant: SemsPlusRecord;
    overview: SemsPlusRecord;
    devices: SemsPlusRecord[];
    realtimeEnergyFlow: SemsPlusRecord;
  };
};

const PLANT_ID_KEYS = ['id', 'plantId', 'stationId'] as const;

export function mergeSemsPlusPlantLists(
  fullPlantList: SemsPlusRecord[],
  stationOverview: SemsPlusRecord[],
) {
  const merged = new Map<string, SemsPlusRecord>();

  for (const plant of fullPlantList) {
    const id = readString(plant, PLANT_ID_KEYS);
    if (id) {
      merged.set(id, { ...plant });
    }
  }

  for (const overview of stationOverview) {
    const id = readString(overview, PLANT_ID_KEYS);
    if (id) {
      merged.set(id, { ...(merged.get(id) || {}), ...overview });
    }
  }

  return Array.from(merged.values());
}

export function mapSemsPlusToLegacySnapshot(
  input: SemsPlusLegacyMapperInput,
): SemsPlusLegacySnapshot {
  const mergedPlants = mergeSemsPlusPlantLists(
    input.fullPlantList,
    input.stationOverview,
  );
  const plant =
    mergedPlants.find((item) => readString(item, PLANT_ID_KEYS) === input.plantId) || {};
  const overview =
    input.stationOverview.find(
      (item) => readString(item, PLANT_ID_KEYS) === input.plantId,
    ) || {};
  const devices = input.devices || [];
  const primaryDevice = devices[0] || {};
  const realtimeEnergyFlow = input.realtimeEnergyFlow || {};

  return {
    provider: 'SEMS_PORTAL',
    plantId: input.plantId,
    plantName: readString(plant, ['name', 'plantName', 'stationName']),
    baseApi: input.baseApi,
    // pSystem remains intentionally unmapped until a sanitized energy-flow fixture confirms its unit.
    currentPvKw: readNumber(realtimeEnergyFlow, ['currentPvKw']),
    batterySocPct: readNumber(realtimeEnergyFlow, ['batterySocPct']),
    todayGeneratedKwh: readNumber(overview, ['productionToday']),
    totalGeneratedKwh: readNumber(overview, ['productionTotal']),
    todayLoadConsumedKwh: readNumber(realtimeEnergyFlow, ['todayLoadConsumedKwh']),
    todayGridImportedKwh: readNumber(realtimeEnergyFlow, ['todayGridImportedKwh']),
    todayGridExportedKwh: readNumber(realtimeEnergyFlow, ['todayGridExportedKwh']),
    inverterSerial: readString(primaryDevice, ['inverterSerial', 'deviceSn', 'serialNumber']),
    inverterStatus: readString(primaryDevice, ['inverterStatus', 'status']),
    fetchedAt: normalizeFetchedAt(input.fetchedAt),
    raw: {
      plant,
      overview,
      devices,
      realtimeEnergyFlow,
    },
  };
}

function readString(source: SemsPlusRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function readNumber(source: SemsPlusRecord, keys: readonly string[]) {
  for (const key of keys) {
    const parsed = parseSemsPlusLocalizedNumber(source[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function normalizeFetchedAt(value?: Date | string) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
