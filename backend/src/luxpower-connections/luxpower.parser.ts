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
  pvPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batteryPowerW: number | null;
  batterySocPct: number | null;
  acCouplePowerW: number | null;
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
  pvPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batteryPowerW: number | null;
  batterySocPct: number | null;
  acCouplePowerW: number | null;
  raw: UnknownRecord;
};

export type LuxPowerPlantDetail = {
  plantId: string | null;
  plantName: string | null;
  inverterCount: number;
  inverters: LuxPowerInverterRecord[];
  raw: {
    plant: UnknownRecord | null;
    inverters: UnknownRecord[];
    tree: UnknownRecord[] | null;
  };
};

export type LuxPowerAggregatePoint = {
  periodKey: string;
  year: number | null;
  month: number | null;
  day: number | null;
  inverterOutputKwh: number | null;
  toUserKwh: number | null;
  consumptionKwh: number | null;
  pvGenerationKwh: number | null;
  gridExportKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
  raw: UnknownRecord;
};

export type LuxPowerSnapshot = {
  provider: 'LUXPOWER';
  sourceMode: 'LOGIN' | 'DEMO';
  plantId: string | null;
  plantName: string | null;
  serialNumber: string | null;
  pvPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batteryPowerW: number | null;
  acCouplePowerW: number | null;
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

function parseSeriesTime(value: unknown) {
  const normalized = parseDateTime(value);
  if (!normalized) {
    return null;
  }

  if (/^\d{2}:\d{2}$/.test(normalized)) {
    const today = new Date().toISOString().slice(0, 10);
    return `${today}T${normalized}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    const today = new Date().toISOString().slice(0, 10);
    return `${today}T${normalized}`;
  }

  return normalized;
}

function firstDefinedNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = toNumberValue(value);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function parseEnergyTenths(...values: unknown[]) {
  for (const value of values) {
    const scaled = scaleTenths(value);
    if (scaled !== null) {
      return scaled;
    }
  }

  return null;
}

function sumTenths(...values: unknown[]) {
  let found = false;
  let total = 0;

  for (const value of values) {
    const numeric = toNumberValue(value);
    if (numeric === null) {
      continue;
    }

    total += numeric;
    found = true;
  }

  return found ? Number((total / 10).toFixed(2)) : null;
}

function toPowerKw(value: number | null) {
  return value === null ? null : Number((value / 1000).toFixed(3));
}

function deriveSignedGridPowerW(item: UnknownRecord) {
  const direct = firstDefinedNumber(item.gridPower, item.gridPowerW);
  if (direct !== null) {
    return direct;
  }

  const importPower = firstDefinedNumber(item.pToUser, item.gridImportPower);
  if (importPower !== null && importPower !== 0) {
    return importPower;
  }

  const exportPower = firstDefinedNumber(item.pToGrid, item.gridExportPower);
  if (exportPower !== null && exportPower !== 0) {
    return exportPower * -1;
  }

  return null;
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
    pvPowerW: firstDefinedNumber(body.solarPv, body.ppv, body.pvPower, body.ppvAll),
    loadPowerW: firstDefinedNumber(body.consumption, body.pout, body.dcOutput, body.loadPower),
    gridPowerW: deriveSignedGridPowerW(body),
    batteryPowerW: firstDefinedNumber(
      body.batteryDischarging,
      body.pBat,
      body.batteryPower,
      body.batteryOutput,
    ),
    batterySocPct: firstDefinedNumber(body.soc, body.bmsSoc),
    acCouplePowerW: firstDefinedNumber(body.acCouplePower),
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
        parseSeriesTime(item.time) ||
        parseDateTime(item.deviceTime) ||
        parseDateTime(item.serverTime);

      if (!recordedAt) {
        return null;
      }

      return {
        recordedAt,
        pvPowerW: firstDefinedNumber(item.solarPv),
        loadPowerW: firstDefinedNumber(item.consumption, item.dcOutput),
        gridPowerW: deriveSignedGridPowerW(item),
        batteryPowerW: firstDefinedNumber(item.batteryDischarging),
        batterySocPct: firstDefinedNumber(item.soc),
        acCouplePowerW: firstDefinedNumber(item.acCouplePower),
        raw: item,
      } satisfies LuxPowerDayPoint;
    })
    .filter((item): item is LuxPowerDayPoint => Boolean(item));
}

function parseAggregateChart(
  payload: unknown,
  key: 'day' | 'month' | 'year',
): LuxPowerAggregatePoint[] {
  const body = asRecord(payload);
  const rows = asArray(body.data);

  return rows
    .map((row) => {
      const item = asRecord(row);
      const periodValue = firstDefinedNumber(item[key]);

      if (periodValue === null) {
        return null;
      }

      const pvGenerationKwh =
        sumTenths(item.ePv1Day, item.ePv2Day, item.ePv3Day) ??
        parseEnergyTenths(item.eGenDay, item.eInvDay);
      const inverterOutputKwh = parseEnergyTenths(item.eInvDay);
      const toUserKwh = parseEnergyTenths(item.eToUserDay);
      const consumptionKwh = parseEnergyTenths(item.eConsumptionDay);
      const gridExportKwh = parseEnergyTenths(item.eToGridDay);
      const batteryChargeKwh = parseEnergyTenths(item.eChgDay);
      const batteryDischargeKwh = parseEnergyTenths(item.eDisChgDay);

      return {
        periodKey:
          key === 'day'
            ? `day:${periodValue}`
            : key === 'month'
              ? `month:${periodValue}`
              : `year:${periodValue}`,
        year: key === 'year' ? periodValue : null,
        month: key === 'month' ? periodValue : null,
        day: key === 'day' ? periodValue : null,
        inverterOutputKwh,
        toUserKwh,
        consumptionKwh,
        pvGenerationKwh,
        gridExportKwh,
        batteryChargeKwh,
        batteryDischargeKwh,
        raw: item,
      } satisfies LuxPowerAggregatePoint;
    })
    .filter((item): item is LuxPowerAggregatePoint => Boolean(item));
}

export function parseLuxPowerMonthChart(payload: unknown) {
  return parseAggregateChart(payload, 'day');
}

export function parseLuxPowerYearChart(payload: unknown) {
  return parseAggregateChart(payload, 'month');
}

export function parseLuxPowerTotalChart(payload: unknown) {
  return parseAggregateChart(payload, 'year');
}

export function buildLuxPowerPlantDetail(params: {
  plant: LuxPowerPlantRecord | null;
  inverters: LuxPowerInverterRecord[];
  treeNodes?: unknown;
}) {
  return {
    plantId: params.plant?.plantId || null,
    plantName: params.plant?.plantName || null,
    inverterCount: params.inverters.length,
    inverters: params.inverters,
    raw: {
      plant: params.plant?.raw || null,
      inverters: params.inverters.map((item) => item.raw),
      tree: Array.isArray(params.treeNodes)
        ? params.treeNodes.map((item) => asRecord(item))
        : null,
    },
  } satisfies LuxPowerPlantDetail;
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
  const latestSeriesPoint = daySeries.at(-1) || null;
  const pvPowerW = latestSeriesPoint?.pvPowerW ?? runtime.pvPowerW;
  const loadPowerW = latestSeriesPoint?.loadPowerW ?? runtime.loadPowerW;
  const gridPowerW = latestSeriesPoint?.gridPowerW ?? runtime.gridPowerW;
  const batteryPowerW = latestSeriesPoint?.batteryPowerW ?? runtime.batteryPowerW;
  const batterySocPct = latestSeriesPoint?.batterySocPct ?? runtime.batterySocPct;
  const acCouplePowerW =
    latestSeriesPoint?.acCouplePowerW ?? runtime.acCouplePowerW;

  return {
    provider: 'LUXPOWER',
    sourceMode,
    plantId: plant?.plantId || inverter?.plantId || null,
    plantName: plant?.plantName || inverter?.plantName || null,
    serialNumber: inverter?.serialNumber || runtime.serialNumber || null,
    pvPowerW,
    loadPowerW,
    gridPowerW,
    batteryPowerW,
    acCouplePowerW,
    currentPvKw: toPowerKw(pvPowerW),
    batterySocPct,
    batteryPowerKw: toPowerKw(batteryPowerW),
    loadPowerKw: toPowerKw(loadPowerW),
    gridImportKw: gridPowerW !== null && gridPowerW > 0 ? toPowerKw(gridPowerW) : null,
    gridExportKw: gridPowerW !== null && gridPowerW < 0 ? toPowerKw(Math.abs(gridPowerW)) : null,
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
