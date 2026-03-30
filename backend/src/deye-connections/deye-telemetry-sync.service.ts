import { BadGatewayException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deriveSystemStatusFromMonitoring } from '../systems/system-status.util';
import { DeyeApiService } from './deye-api.service';
import { DeyeAuthService } from './deye-auth.service';
import {
  ParsedDeyeDailyRecord,
  ParsedDeyeTelemetryRecord,
  parseDeyeDailyHistory,
  parseDeyePowerHistory,
} from './deye.parser';

type DeyeConnectionRecord = any;
type DeyeSession = {
  connection: DeyeConnectionRecord;
  authHeader: string;
};
type SolarSystemRecord = any;

@Injectable()
export class DeyeTelemetrySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deyeApiService: DeyeApiService,
    private readonly deyeAuthService: DeyeAuthService,
  ) {}

  async syncOperationalData(
    connectionInput: string | DeyeConnectionRecord,
    options?: {
      stationIds?: string[];
      powerWindowHours?: number;
      dailyLookbackDays?: number;
    },
  ) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const systems = await this.prisma.solarSystem.findMany({
        where: {
          deletedAt: null,
          deyeConnectionId: session.connection.id,
          sourceSystem: 'DEYE',
          ...(options?.stationIds?.length
            ? {
                stationId: {
                  in: options.stationIds,
                },
              }
            : {}),
        },
        include: {
          devices: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'desc' as const }],
          },
        },
        orderBy: [{ createdAt: 'desc' as const }],
      });

      const stations: Array<Record<string, unknown>> = [];
      let syncedRealtimeRecords = 0;
      let syncedDailyRecords = 0;

      for (const system of systems) {
        if (!system.stationId) {
          stations.push({
            systemId: system.id,
            systemName: system.name,
            stationId: null,
            telemetryRecords: 0,
            dailyRecords: 0,
            reason: 'System chua co station_id de dong bo monitoring Deye.',
          });
          continue;
        }

        const stationResult = await this.syncSystemWithSession(session, system, options);
        syncedRealtimeRecords += stationResult.telemetryRecords;
        syncedDailyRecords += stationResult.dailyRecords;
        stations.push({
          systemId: system.id,
          systemName: system.name,
          stationId: system.stationId,
          telemetryRecords: stationResult.telemetryRecords,
          dailyRecords: stationResult.dailyRecords,
          latestTelemetryAt: stationResult.latestTelemetryAt,
          latestDailyAt: stationResult.latestDailyAt,
        });
      }

      await this.prisma.deyeConnection.update({
        where: { id: session.connection.id },
        data: {
          lastSyncTime: new Date(),
          status: 'SYNCED',
          lastError: null,
        },
      });

      return {
        syncedRealtimeRecords,
        syncedDailyRecords,
        stations,
      };
    });
  }

  async syncSystemOperationalData(
    connectionInput: string | DeyeConnectionRecord,
    systemId: string,
    options?: {
      stationId?: string;
      powerWindowHours?: number;
      dailyLookbackDays?: number;
    },
  ) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const system = await this.prisma.solarSystem.findFirst({
        where: {
          id: systemId,
          deletedAt: null,
        },
        include: {
          devices: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'desc' as const }],
          },
        },
      });

      if (!system) {
        throw new BadGatewayException({
          message: 'Khong tim thay he thong can dong bo du lieu Deye.',
          provider: 'DEYE',
        });
      }

      if (options?.stationId && system.stationId && options.stationId !== system.stationId) {
        throw new BadGatewayException({
          message: 'Station Deye duoc yeu cau khong khop voi system hien tai.',
          provider: 'DEYE',
        });
      }

      if (!system.stationId) {
        throw new BadGatewayException({
          message: 'He thong chua duoc gan station Deye de dong bo telemetry.',
          provider: 'DEYE',
        });
      }

      return this.syncSystemWithSession(session, system, options);
    });
  }

  private async syncSystemWithSession(
    session: DeyeSession,
    system: SolarSystemRecord,
    options?: {
      powerWindowHours?: number;
      dailyLookbackDays?: number;
    },
  ) {
    const powerWindowHours = options?.powerWindowHours || 48;
    const dailyLookbackDays = options?.dailyLookbackDays || 30;
    const syncTime = new Date();

    const powerPayload = await this.requestPowerHistory(
      session,
      system.stationId,
      powerWindowHours,
    );
    const powerHistory = parseDeyePowerHistory(powerPayload, system.stationId);
    const telemetryRecords = await this.upsertTelemetryRecords(
      session.connection.id,
      system,
      powerHistory.records,
      syncTime,
    );

    const dailyPayload = await this.requestDailyHistory(
      session,
      system.stationId,
      dailyLookbackDays,
    );
    let dailyHistory = parseDeyeDailyHistory(dailyPayload, system.stationId);
    if (!dailyHistory.records.length && powerHistory.records.length) {
      dailyHistory = {
        stationId: system.stationId,
        records: this.aggregateDailyFromTelemetry(system.stationId, powerHistory.records),
        raw: dailyPayload as Record<string, unknown>,
      };
    }

    const dailyRecords = await this.upsertDailyRecords(
      session.connection.id,
      system,
      dailyHistory.records,
      syncTime,
    );
    await this.prisma.deyeDailyRecord.updateMany({
      where: {
        solarSystemId: system.id,
        stationId: system.stationId,
        deletedAt: null,
        recordDate: {
          lt: new Date('2000-01-01T00:00:00.000Z'),
        },
      },
      data: {
        deletedAt: syncTime,
      },
    });

    const latestTelemetryRecord = await this.prisma.deyeTelemetryRecord.findFirst({
      where: {
        solarSystemId: system.id,
        deletedAt: null,
      },
      orderBy: [{ recordedAt: 'desc' }],
    });
    const latestDailyRecord = await this.prisma.deyeDailyRecord.findFirst({
      where: {
        solarSystemId: system.id,
        deletedAt: null,
      },
      orderBy: [{ recordDate: 'desc' }],
    });

    const primaryDevice =
      system.devices?.find((device: any) =>
        String(device.deviceType || '')
          .toUpperCase()
          .includes('INVERTER'),
      ) ||
      system.devices?.[0] ||
      null;

    const previousSnapshot =
      system.latestMonitorSnapshot &&
      typeof system.latestMonitorSnapshot === 'object' &&
      !Array.isArray(system.latestMonitorSnapshot)
        ? (system.latestMonitorSnapshot as Record<string, unknown>)
        : {};

    const connectionStatus = this.normalizeConnectionStatus(
      primaryDevice?.connectStatus,
      latestTelemetryRecord?.recordedAt || null,
    );

    await this.prisma.solarSystem.update({
      where: { id: system.id },
      data: {
        status: deriveSystemStatusFromMonitoring({
          currentStatus: system.status,
          connectionStatus,
          latestTelemetryAt: latestTelemetryRecord?.recordedAt || null,
        }),
        lastRealtimeSyncAt: syncTime,
        lastHourlySyncAt: syncTime,
        lastDailySyncAt: syncTime,
        latestMonitorAt: latestTelemetryRecord?.recordedAt || system.latestMonitorAt,
        currentGenerationPowerKw:
          latestTelemetryRecord?.generationPowerKw ?? system.currentGenerationPowerKw,
        latestMonitorSnapshot: {
          ...previousSnapshot,
          provider: 'DEYE',
          plantId: system.stationId,
          plantName: system.stationName || system.name,
          currentPvKw: this.toNullableNumber(latestTelemetryRecord?.generationPowerKw),
          batterySocPct: this.toNullableNumber(latestTelemetryRecord?.batterySocPct),
          todayGeneratedKwh: this.toNullableNumber(latestDailyRecord?.generationValueKwh),
          totalGeneratedKwh: this.toNullableNumber(system.totalGenerationKwh),
          todayLoadConsumedKwh: this.toNullableNumber(latestDailyRecord?.consumptionValueKwh),
          todayGridImportedKwh: this.toNullableNumber(latestDailyRecord?.purchaseValueKwh),
          todayGridExportedKwh: this.toNullableNumber(latestDailyRecord?.gridValueKwh),
          inverterSerial: primaryDevice?.deviceSn || previousSnapshot.inverterSerial || null,
          inverterStatus: connectionStatus,
          installedPowerKw:
            this.toNullableNumber(system.installedCapacityKwp) ||
            this.toNullableNumber(system.capacityKwp),
          deviceId: primaryDevice?.deviceId || previousSnapshot.deviceId || null,
          deviceModel:
            primaryDevice?.productId ||
            primaryDevice?.deviceType ||
            system.inverterModel ||
            previousSnapshot.deviceModel ||
            null,
          deviceType: primaryDevice?.deviceType || previousSnapshot.deviceType || null,
          fetchedAt:
            latestTelemetryRecord?.recordedAt?.toISOString() ||
            latestDailyRecord?.recordDate?.toISOString() ||
            null,
          lastRealtimeSyncAt: syncTime.toISOString(),
          lastDailySyncAt: syncTime.toISOString(),
          lastHourlySyncAt: syncTime.toISOString(),
          connectionStatus,
          dataScopes: {
            station: Boolean(system.stationId),
            realtime: Boolean(latestTelemetryRecord),
            hourly: Boolean(latestTelemetryRecord),
            daily: Boolean(latestDailyRecord),
            monthly: Boolean(system.lastMonthlySyncAt),
          },
          raw: {
            latestTelemetry: latestTelemetryRecord?.rawPayload || null,
            latestDaily: latestDailyRecord?.rawPayload || null,
          },
        } as any,
      },
    });

    return {
      telemetryRecords,
      dailyRecords,
      latestTelemetryAt: latestTelemetryRecord?.recordedAt?.toISOString() || null,
      latestDailyAt: latestDailyRecord?.recordDate?.toISOString() || null,
    };
  }

  private async upsertTelemetryRecords(
    connectionId: string,
    system: SolarSystemRecord,
    records: ParsedDeyeTelemetryRecord[],
    syncTime: Date,
  ) {
    let count = 0;

    for (const record of records) {
      await this.prisma.deyeTelemetryRecord.upsert({
        where: {
          stationId_recordedAt: {
            stationId: record.stationId,
            recordedAt: new Date(record.recordedAt),
          },
        },
        update: {
          solarSystemId: system.id,
          deyeConnectionId: connectionId,
          generationPowerKw: record.generationPowerKw,
          generationValueKwh: record.generationValueKwh,
          consumptionPowerKw: record.consumptionPowerKw,
          consumptionValueKwh: record.consumptionValueKwh,
          purchasePowerKw: record.purchasePowerKw,
          purchaseValueKwh: record.purchaseValueKwh,
          gridPowerKw: record.gridPowerKw,
          gridValueKwh: record.gridValueKwh,
          batteryPowerKw: record.batteryPowerKw,
          batterySocPct: record.batterySocPct,
          chargePowerKw: record.chargePowerKw,
          chargeValueKwh: record.chargeValueKwh,
          dischargePowerKw: record.dischargePowerKw,
          dischargeValueKwh: record.dischargeValueKwh,
          fullPowerHours: record.fullPowerHours,
          syncTime,
          rawPayload: record.raw as any,
          deletedAt: null,
        },
        create: {
          solarSystemId: system.id,
          deyeConnectionId: connectionId,
          stationId: record.stationId,
          recordedAt: new Date(record.recordedAt),
          generationPowerKw: record.generationPowerKw,
          generationValueKwh: record.generationValueKwh,
          consumptionPowerKw: record.consumptionPowerKw,
          consumptionValueKwh: record.consumptionValueKwh,
          purchasePowerKw: record.purchasePowerKw,
          purchaseValueKwh: record.purchaseValueKwh,
          gridPowerKw: record.gridPowerKw,
          gridValueKwh: record.gridValueKwh,
          batteryPowerKw: record.batteryPowerKw,
          batterySocPct: record.batterySocPct,
          chargePowerKw: record.chargePowerKw,
          chargeValueKwh: record.chargeValueKwh,
          dischargePowerKw: record.dischargePowerKw,
          dischargeValueKwh: record.dischargeValueKwh,
          fullPowerHours: record.fullPowerHours,
          syncTime,
          rawPayload: record.raw as any,
        },
      });

      count += 1;
    }

    return count;
  }

  private async upsertDailyRecords(
    connectionId: string,
    system: SolarSystemRecord,
    records: ParsedDeyeDailyRecord[],
    syncTime: Date,
  ) {
    let count = 0;

    for (const record of records) {
      await this.prisma.deyeDailyRecord.upsert({
        where: {
          stationId_recordDate: {
            stationId: record.stationId,
            recordDate: new Date(record.recordDate),
          },
        },
        update: {
          solarSystemId: system.id,
          deyeConnectionId: connectionId,
          generationValueKwh: record.generationValueKwh,
          consumptionValueKwh: record.consumptionValueKwh,
          purchaseValueKwh: record.purchaseValueKwh,
          gridValueKwh: record.gridValueKwh,
          batterySocPct: record.batterySocPct,
          fullPowerHours: record.fullPowerHours,
          syncTime,
          rawPayload: record.raw as any,
          deletedAt: null,
        },
        create: {
          solarSystemId: system.id,
          deyeConnectionId: connectionId,
          stationId: record.stationId,
          recordDate: new Date(record.recordDate),
          generationValueKwh: record.generationValueKwh,
          consumptionValueKwh: record.consumptionValueKwh,
          purchaseValueKwh: record.purchaseValueKwh,
          gridValueKwh: record.gridValueKwh,
          batterySocPct: record.batterySocPct,
          fullPowerHours: record.fullPowerHours,
          syncTime,
          rawPayload: record.raw as any,
        },
      });

      count += 1;
    }

    return count;
  }

  private async requestPowerHistory(
    session: DeyeSession,
    stationId: string,
    powerWindowHours: number,
  ) {
    const endAt = Date.now();
    const startAt = endAt - powerWindowHours * 60 * 60 * 1000;

    const response = await this.tryPowerHistoryRequest(
      session,
      stationId,
      Math.floor(startAt / 1000),
      Math.floor(endAt / 1000),
    );
    const parsed = parseDeyePowerHistory(response, stationId);

    if (parsed.records.length) {
      return response;
    }

    const responseInSeconds = await this.tryPowerHistoryRequest(
      session,
      stationId,
      startAt,
      endAt,
    );

    return responseInSeconds;
  }

  private async tryPowerHistoryRequest(
    session: DeyeSession,
    stationId: string,
    startTimestamp: number,
    endTimestamp: number,
  ) {
    const payload = (await this.deyeApiService.post(
      session.connection.baseUrl,
      '/v1.0/station/history/power',
      {
        stationId: this.toStationIdentifier(stationId),
        startTimestamp,
        endTimestamp,
      },
      {
        headers: {
          Authorization: session.authHeader,
        },
        description: `Deye power history ${stationId}`,
      },
    )) as Record<string, unknown>;

    this.ensureSuccess(payload, `Lay power history cho station ${stationId} that bai.`);
    return payload;
  }

  private async requestDailyHistory(
    session: DeyeSession,
    stationId: string,
    dailyLookbackDays: number,
  ) {
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - (dailyLookbackDays - 1) * 24 * 60 * 60 * 1000);

    const payload = (await this.deyeApiService.post(
      session.connection.baseUrl,
      '/v1.0/station/history',
      {
        stationId: this.toStationIdentifier(stationId),
        granularity: 2,
        startAt: this.formatDateInput(startAt),
        endAt: this.formatDateInput(endAt),
      },
      {
        headers: {
          Authorization: session.authHeader,
        },
        description: `Deye daily history ${stationId}`,
      },
    )) as Record<string, unknown>;

    this.ensureSuccess(payload, `Lay daily history cho station ${stationId} that bai.`);
    return payload;
  }

  private aggregateDailyFromTelemetry(
    stationId: string,
    records: ParsedDeyeTelemetryRecord[],
  ): ParsedDeyeDailyRecord[] {
    const map = new Map<string, ParsedDeyeDailyRecord>();

    for (const record of records) {
      const dateKey = `${record.recordedAt.slice(0, 10)}T00:00:00.000Z`;
      const current = map.get(dateKey) || {
        stationId,
        recordDate: dateKey,
        generationValueKwh: 0,
        consumptionValueKwh: 0,
        purchaseValueKwh: 0,
        gridValueKwh: 0,
        batterySocPct: null,
        fullPowerHours: null,
        raw: {
          source: 'POWER_HISTORY_FALLBACK',
          records: [],
        },
      };

      current.generationValueKwh =
        (current.generationValueKwh || 0) + (record.generationValueKwh || 0);
      current.consumptionValueKwh =
        (current.consumptionValueKwh || 0) + (record.consumptionValueKwh || 0);
      current.purchaseValueKwh =
        (current.purchaseValueKwh || 0) + (record.purchaseValueKwh || 0);
      current.gridValueKwh = (current.gridValueKwh || 0) + (record.gridValueKwh || 0);
      current.batterySocPct =
        record.batterySocPct !== null && record.batterySocPct !== undefined
          ? record.batterySocPct
          : current.batterySocPct;
      current.fullPowerHours =
        record.fullPowerHours !== null && record.fullPowerHours !== undefined
          ? record.fullPowerHours
          : current.fullPowerHours;
      map.set(dateKey, current);
    }

    return [...map.values()].sort((left, right) =>
      left.recordDate.localeCompare(right.recordDate),
    );
  }

  private normalizeConnectionStatus(
    rawStatus: string | null | undefined,
    latestTelemetryAt: Date | null,
  ) {
    const normalized = String(rawStatus || '')
      .trim()
      .toLowerCase();

    if (normalized.includes('2') || normalized.includes('alert')) {
      return 'CANH_BAO';
    }

    if (normalized.includes('1') || normalized.includes('online')) {
      return 'TRUC_TUYEN';
    }

    if (latestTelemetryAt && Date.now() - latestTelemetryAt.getTime() <= 30 * 60 * 1000) {
      return 'TRUC_TUYEN';
    }

    return 'CHUA_CO_DU_LIEU_THOI_GIAN_THUC';
  }

  private formatDateInput(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private toStationIdentifier(stationId: string) {
    const numeric = Number(stationId);
    return Number.isFinite(numeric) ? numeric : stationId;
  }

  private ensureSuccess(payload: Record<string, unknown>, fallback: string) {
    const success = payload.success === true || String(payload.code || '') === '1000000';
    if (!success) {
      throw new BadGatewayException({
        message: String(payload.msg || fallback),
        provider: 'DEYE',
        code: payload.code || null,
        requestId: payload.requestId || null,
      });
    }
  }

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
