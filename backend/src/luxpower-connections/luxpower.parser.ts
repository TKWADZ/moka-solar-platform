type UnknownRecord = Record<string, unknown>;

export type LuxPowerPlantRecord = {
  plantId: string;
  plantName: string | null;
  createdAt: string | null;
  raw: UnknownRecord;
};

export type LuxPowerInverterRecord = {
  serialNumber: string;
  plantId: string | null;
  plantName: string | null;
  model: string | null;
  deviceType: string | null;
  statusText: string | null;
  powerRatingText: string | null;
  lastUpdateTime: string | null;
  raw: UnknownRecord;
};

export type LuxPowerRuntimeRecord = {
  serialNumber: string;
  recordedAt: string | null;
  pvPowerKw: number | null;
  loadPowerKw: number | null;
  gridImportKw: number | null;
  gridExportKw: number | null;
  batteryPowerKw: number | null;
  batterySocPct: number | null;
  inverterStatus: string | null;
  hasRuntimeData: boolean;
  raw: UnknownRecord;
};

export type LuxPowerEnergyRecord = {
  todayGenerationKwh: number | null;
  totalGenerationKwh: number | null;
  todayChargingKwh: number | null;
  totalChargingKwh: number | null;
  todayDischargingKwh: number | null;
  totalDischargingKwh: number | null;
  todayExportKwh: number | null;
  totalExportKwh: number | null;
  hasRuntimeData: boolean;
  raw: UnknownRecord;
};

export type LuxPowerDayPoint = {
  recordedAt: string;
  pvPowerKw: number | null;
  loadPowerKw: number | null;
  batteryDischargingKw: number | null;
  raw: UnknownRecord;
};

export type LuxPowerSnapshot = {
  provider: 'LUXPOWER';
  sourceMode: 'LOGIN' | 'DEMO';
  plantId: string | null;
  plantName: string | null;
  serialNumber: string | null;
  currentPvKw: number | null;
  batterySocPct: number | null;
  batteryPowerKw: number | null;
  loadPowerKw: number | null;
  gridImportKw: number | null;
  gridExportKw: number | null;
  todayGenerationKwh: number | null;
  totalGenerationKwh: number | null;
  todayChargingKwh: number | null;
  totalChargingKwh: number | null;
  todayDischargingKwh: number | null;
  totalDischargingKwh: number | null;
  todayExportKwh: number | null;
  totalExportKwh: number | null;
  inverterStatus: string | null;
  fetchedAt: string;
  runtimeRecordedAt: string | null;
  daySeries: LuxPowerDayPoint[];
  raw: {
    runtime: UnknownRecord;
    energy: UnknownRecord;
    inverter?: UnknownRecord | null;
  };
};

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function toNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function scaleTenths(value: unknown) {
  const numeric = toNumberValue(value);
  return numeric === null ? null : Number((numeric / 10).toFixed(2));
}

function parseDateTime(value: unknown) {
  const text = toStringValue(value);
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return text.replace(' ', 'T');
  }

  return text;
}

export function parseLuxPowerPlants(payload: unknown): LuxPowerPlantRecord[] {
  const body = asRecord(payload);
  const rows = asArray(body.rows);

  return rows
    .map((row) => {
      const item = asRecord(row);
      const plantId =
        toStringValue(item.plantId) ||
        toStringValue(item.id) ||
        toStringValue(item.stationId);

      if (!plantId) {
        return null;
      }

      return {
        plantId,
        plantName:
          toStringValue(item.name) ||
          toStringValue(item.plantName) ||
          toStringValue(item.stationName),
        createdAt: toStringValue(item.createDate),
        raw: item,
      } satisfies LuxPowerPlantRecord;
    })
    .filter((item): item is LuxPowerPlantRecord => Boolean(item));
}

export function parseLuxPowerInverters(payload: unknown): LuxPowerInverterRecord[] {
  const body = asRecord(payload);
  const rows = asArray(body.rows);

  return rows
    .map((row) => {
      const item = asRecord(row);
      const serialNumber =
        toStringValue(item.serialNum) ||
        toStringValue(item.serialNumber) ||
        toStringValue(item.deviceSn);

      if (!serialNumber) {
        return null;
      }

      return {
        serialNumber,
        plantId: toStringValue(item.plantId),
        plantName: toStringValue(item.plantName),
        model: toStringValue(item.modelText) || toStringValue(item.model),
        deviceType: toStringValue(item.deviceTypeText) || toStringValue(item.deviceType),
        statusText: toStringValue(item.statusText),
        powerRatingText: toStringValue(item.powerRatingText),
        lastUpdateTime: toStringValue(item.lastUpdateTime),
        raw: item,
      } satisfies LuxPowerInverterRecord;
    })
    .filter((item): item is LuxPowerInverterRecord => Boolean(item));
}

export function parseLuxPowerRuntime(payload: unknown): LuxPowerRuntimeRecord {
  const body = asRecord(payload);

  return {
    serialNumber: toStringValue(body.serialNum) || '',
    recordedAt: parseDateTime(body.deviceTime) || parseDateTime(body.serverTime),
    pvPowerKw: scaleTenths(body.ppv),
    loadPowerKw: scaleTenths(body.pout),
    gridImportKw: scaleTenths(body.pToUser),
    gridExportKw: scaleTenths(body.pToGrid),
    batteryPowerKw: scaleTenths(body.pBat),
    batterySocPct: toNumberValue(body.bmsSoc),
    inverterStatus: toStringValue(body.statusText),
    hasRuntimeData: body.hasRuntimeData === true,
    raw: body,
  };
}

function parseEnergyValue(rawValue: unknown, textValue: unknown) {
  const scaled = scaleTenths(rawValue);
  if (scaled !== null) {
    return scaled;
  }

  return toNumberValue(textValue);
}

export function parseLuxPowerEnergy(payload: unknown): LuxPowerEnergyRecord {
  const body = asRecord(payload);

  return {
    todayGenerationKwh: parseEnergyValue(body.todayYielding, body.todayYieldingText),
    totalGenerationKwh: parseEnergyValue(body.totalYielding, body.totalYieldingText),
    todayChargingKwh: parseEnergyValue(body.todayCharging, body.todayChargingText),
    totalChargingKwh: parseEnergyValue(body.totalCharging, body.totalChargingText),
    todayDischargingKwh: parseEnergyValue(body.todayDischarging, body.todayDischargingText),
    totalDischargingKwh: parseEnergyValue(body.totalDischarging, body.totalDischargingText),
    todayExportKwh: parseEnergyValue(body.todayExport, body.todayExportText),
    totalExportKwh: parseEnergyValue(body.totalExport, body.totalExportText),
    hasRuntimeData: body.hasRuntimeData === true,
    raw: body,
  };
}

export function parseLuxPowerDayChart(payload: unknown): LuxPowerDayPoint[] {
  const body = asRecord(payload);
  const rows = asArray(body.data);

  return rows
    .map((row) => {
      const item = asRecord(row);
      const recordedAt =
        parseDateTime(item.time) ||
        parseDateTime(item.deviceTime) ||
        parseDateTime(item.serverTime);

      if (!recordedAt) {
        return null;
      }

      return {
        recordedAt,
        pvPowerKw: scaleTenths(item.solarPv),
        loadPowerKw: scaleTenths(item.dcOutput),
        batteryDischargingKw: scaleTenths(item.batteryDischarging),
        raw: item,
      } satisfies LuxPowerDayPoint;
    })
    .filter((item): item is LuxPowerDayPoint => Boolean(item));
}

export function buildLuxPowerSnapshot(params: {
  sourceMode: 'LOGIN' | 'DEMO';
  plant: LuxPowerPlantRecord | null;
  inverter: LuxPowerInverterRecord | null;
  runtime: LuxPowerRuntimeRecord;
  energy: LuxPowerEnergyRecord;
  daySeries?: LuxPowerDayPoint[];
}) {
  const { sourceMode, plant, inverter, runtime, energy, daySeries = [] } = params;
  const fetchedAt = new Date().toISOString();

  return {
    provider: 'LUXPOWER',
    sourceMode,
    plantId: plant?.plantId || inverter?.plantId || null,
    plantName: plant?.plantName || inverter?.plantName || null,
    serialNumber: inverter?.serialNumber || runtime.serialNumber || null,
    currentPvKw: runtime.pvPowerKw,
    batterySocPct: runtime.batterySocPct,
    batteryPowerKw: runtime.batteryPowerKw,
    loadPowerKw: runtime.loadPowerKw,
    gridImportKw: runtime.gridImportKw,
    gridExportKw: runtime.gridExportKw,
    todayGenerationKwh: energy.todayGenerationKwh,
    totalGenerationKwh: energy.totalGenerationKwh,
    todayChargingKwh: energy.todayChargingKwh,
    totalChargingKwh: energy.totalChargingKwh,
    todayDischargingKwh: energy.todayDischargingKwh,
    totalDischargingKwh: energy.totalDischargingKwh,
    todayExportKwh: energy.todayExportKwh,
    totalExportKwh: energy.totalExportKwh,
    inverterStatus: runtime.inverterStatus || inverter?.statusText || null,
    fetchedAt,
    runtimeRecordedAt: runtime.recordedAt,
    daySeries,
    raw: {
      runtime: runtime.raw,
      energy: energy.raw,
      inverter: inverter?.raw || null,
    },
  } satisfies LuxPowerSnapshot;
}
