import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { SolarmanSyncDto } from './dto/solarman-sync.dto';

type SolarmanResolvedConfig = {
  baseUrl: string;
  appId: string;
  appSecret: string;
  username: string;
  password: string;
  stationId: number;
  timeType: number;
  startDate: string;
  endDate: string;
};

type SolarmanHistoryPoint = {
  time: string;
  generationKwh: number | null;
  consumptionKwh: number | null;
  income: number | null;
  raw: Record<string, unknown>;
};

type SolarmanMonitorSnapshot = {
  provider: 'SOLARMAN';
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
  installedPowerKw: number | null;
  ratedPowerKw: number | null;
  deviceId: string | null;
  deviceModel: string | null;
  deviceType: string | null;
  todayIncome: number | null;
  incomeTotal: number | null;
  co2ReductionTons: number | null;
  fetchedAt: string;
  historyPoints: SolarmanHistoryPoint[];
  raw: {
    station: Record<string, unknown>;
    devices: Record<string, unknown>;
    history: Record<string, unknown>;
  };
};

type SolarmanTokenCache = {
  token: string;
  expiresAt: number;
  fingerprint: string;
};

@Injectable()
export class SolarmanService {
  private tokenCache: SolarmanTokenCache | null = null;
  private readonly timeoutMs = Number(process.env.REQUEST_TIMEOUT || 20000);

  async fetchMonitorSnapshot(dto: SolarmanSyncDto): Promise<SolarmanMonitorSnapshot> {
    const config = this.resolveConfig(dto);
    const token = await this.ensureToken(config);
    const stationsResponse = await this.postJson(
      config,
      '/station/v1.0/list',
      {
        page: 1,
        size: 100,
      },
      token,
      'SOLARMAN station list',
    );
    const station = this.findStation(stationsResponse, config.stationId);
    const devicesResponse = await this.postJson(
      config,
      '/station/v1.0/device',
      {
        stationId: config.stationId,
        deviceType: 'INVERTER',
        page: 1,
        size: 50,
      },
      token,
      'SOLARMAN device list',
    );
    const historyResponse = await this.postJson(
      config,
      '/station/v1.0/history',
      {
        stationId: config.stationId,
        timeType: config.timeType,
        startTime: config.startDate,
        endTime: config.endDate,
      },
      token,
      'SOLARMAN history',
    );

    return this.buildSnapshot(config, station, devicesResponse, historyResponse);
  }

  private resolveConfig(dto: SolarmanSyncDto): SolarmanResolvedConfig {
    const baseUrl = (
      dto.baseUrl ||
      process.env.SOLARMAN_BASE_URL ||
      'https://globalapi.solarmanpv.com'
    ).replace(/\/$/, '');
    const appId = dto.appId || process.env.SOLARMAN_APP_ID || '';
    const appSecret = dto.appSecret || process.env.SOLARMAN_APP_SECRET || '';
    const username = dto.username || process.env.SOLARMAN_USERNAME || '';
    const password = dto.password || process.env.SOLARMAN_PASSWORD || '';
    const stationIdRaw = dto.stationId || process.env.SOLARMAN_STATION_ID || '';
    const stationId = Number(stationIdRaw);

    if (!appId || !appSecret || !username || !password) {
      throw new BadRequestException(
        'Thiếu cấu hình SOLARMAN. Hãy gửi appId, appSecret, username, password hoặc khai báo SOLARMAN_* trong biến môi trường.',
      );
    }

    if (!Number.isFinite(stationId)) {
      throw new BadRequestException('Station ID SOLARMAN không hợp lệ.');
    }

    const referenceDate = dto.recordDate ? new Date(dto.recordDate) : new Date();
    const normalizedReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const fallbackDate = normalizedReferenceDate.toISOString().slice(0, 10);

    return {
      baseUrl,
      appId,
      appSecret,
      username,
      password,
      stationId,
      timeType: dto.timeType || 2,
      startDate: dto.startDate || fallbackDate,
      endDate: dto.endDate || fallbackDate,
    };
  }

  private async ensureToken(config: SolarmanResolvedConfig) {
    const fingerprint = `${config.baseUrl}|${config.appId}|${config.username}`;
    const now = Date.now();

    if (this.tokenCache && this.tokenCache.fingerprint === fingerprint && now < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const payloads = [
      {
        appId: config.appId,
        appSecret: config.appSecret,
        email: config.username,
        password: config.password,
        timeStamp: now,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        email: config.username,
        password: this.sha256(config.password),
        timeStamp: now,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        account: config.username,
        pwd: config.password,
        timeStamp: now,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        account: config.username,
        pwd: this.sha256(config.password),
        timeStamp: now,
      },
    ];

    let lastError: unknown;

    for (const payload of payloads) {
      try {
        const response = await this.postJson(
          config,
          '/account/v1.0/token',
          payload,
          null,
          'SOLARMAN login',
        );
        const token =
          this.toString(response.access_token) ||
          this.toString(response.token) ||
          this.toString(this.asRecord(response.data).access_token) ||
          this.toString(this.asRecord(response.data).token);

        if (token) {
          this.tokenCache = {
            token,
            fingerprint,
            expiresAt: Date.now() + 50 * 24 * 60 * 60 * 1000,
          };

          return token;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message: 'Không lấy được token SOLARMAN.',
      provider: 'SOLARMAN',
      detail: lastError instanceof Error ? lastError.message : 'Unknown SOLARMAN login error',
    });
  }

  private buildSnapshot(
    config: SolarmanResolvedConfig,
    station: Record<string, unknown>,
    devicesResponse: Record<string, unknown>,
    historyResponse: Record<string, unknown>,
  ): SolarmanMonitorSnapshot {
    const deviceItems = this.findFirstList(devicesResponse);
    const primaryDevice = this.selectPrimaryDevice(deviceItems);
    const historyPoints = this.parseHistoryPoints(historyResponse);
    const latestHistoryPoint = historyPoints[historyPoints.length - 1] || null;

    return {
      provider: 'SOLARMAN',
      plantId: String(config.stationId),
      plantName: this.firstString(station, ['stationName', 'name']),
      baseApi: config.baseUrl,
      currentPvKw:
        this.firstNumber(station, [
          'currentPower',
          'currentGenerationPower',
          'generationPower',
          'pac',
          'power',
        ]) ??
        this.firstNumber(primaryDevice, [
          'currentPower',
          'generationPower',
          'pac',
          'power',
        ]),
      batterySocPct:
        this.firstNumber(station, ['soc', 'batterySoc']) ??
        this.firstNumber(primaryDevice, ['soc', 'batterySoc']),
      todayGeneratedKwh:
        this.firstNumber(station, ['todayPowerGeneration', 'todayElectricity']) ??
        latestHistoryPoint?.generationKwh ??
        null,
      totalGeneratedKwh: this.firstNumber(station, ['totalPowerGeneration', 'generationTotal']),
      todayLoadConsumedKwh: latestHistoryPoint?.consumptionKwh ?? null,
      todayGridImportedKwh: this.firstNumber(station, ['gridImport', 'gridConsumption']),
      todayGridExportedKwh: this.firstNumber(station, ['gridExport', 'feedIn']),
      inverterSerial: this.firstString(primaryDevice, ['sn', 'serialNo', 'deviceSn']),
      inverterStatus:
        this.firstString(primaryDevice, ['status', 'deviceStatus']) ??
        this.firstString(station, ['status', 'stationStatus']),
      installedPowerKw: this.firstNumber(station, ['installedPower', 'capacity', 'installedCapacity']),
      ratedPowerKw: this.firstNumber(primaryDevice, ['ratedPower', 'power']),
      deviceId:
        primaryDevice.deviceId !== undefined && primaryDevice.deviceId !== null
          ? String(primaryDevice.deviceId)
          : primaryDevice.id !== undefined && primaryDevice.id !== null
            ? String(primaryDevice.id)
            : null,
      deviceModel: this.firstString(primaryDevice, ['deviceModel', 'model']),
      deviceType: this.firstString(primaryDevice, ['deviceType']),
      todayIncome: latestHistoryPoint?.income ?? null,
      incomeTotal: this.firstNumber(station, ['totalIncome', 'incomeTotal']),
      co2ReductionTons: this.firstNumber(station, ['co2ReductionTotal', 'co2']),
      fetchedAt: new Date().toISOString(),
      historyPoints,
      raw: {
        station,
        devices: devicesResponse,
        history: historyResponse,
      },
    };
  }

  private async postJson(
    config: SolarmanResolvedConfig,
    path: string,
    body: Record<string, unknown>,
    token: string | null,
    context: string,
  ) {
    const url = `${config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new BadGatewayException({
        message: `${context} thất bại khi gọi tới SOLARMAN.`,
        provider: 'SOLARMAN',
        detail: error instanceof Error ? error.message : 'Unknown network error',
      });
    }

    clearTimeout(timeout);

    const text = await response.text();
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException({
        message: `${context} trả về dữ liệu không hợp lệ từ SOLARMAN.`,
        provider: 'SOLARMAN',
        statusCode: response.status,
        raw: text.slice(0, 500),
      });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        message: `${context} trả về lỗi HTTP ${response.status}.`,
        provider: 'SOLARMAN',
        response: parsed,
      });
    }

    const success = parsed.success;
    const code = parsed.code;
    if (success === false) {
      throw new BadGatewayException({
        message: `${context} không thành công.`,
        provider: 'SOLARMAN',
        response: parsed,
      });
    }

    if (code !== undefined && !['0', '200', 'None', 'null'].includes(String(code))) {
      throw new BadGatewayException({
        message: `${context} trả về mã lỗi SOLARMAN.`,
        provider: 'SOLARMAN',
        code,
        msg: parsed.msg || parsed.message || 'Unknown SOLARMAN error',
      });
    }

    return parsed;
  }

  private findStation(response: Record<string, unknown>, stationId: number) {
    const stations = this.findFirstList(response);
    return (
      stations.find((item) => {
        const value = item.stationId || item.id || item.plantId;
        return Number(value) === stationId;
      }) || {}
    );
  }

  private findFirstList(response: Record<string, unknown>) {
    const data = this.asRecord(response.data);
    const candidates = [
      response.list,
      response.deviceList,
      response.stationList,
      data.list,
      data.deviceList,
      data.stationList,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map((item) => this.asRecord(item));
      }
    }

    return [] as Record<string, unknown>[];
  }

  private parseHistoryPoints(response: Record<string, unknown>): SolarmanHistoryPoint[] {
    return this.findFirstList(response).map((item) => ({
      time:
        this.firstString(item, ['time', 'date', 'collectTime', 'ts']) ||
        new Date().toISOString(),
      generationKwh: this.firstNumber(item, ['generation', 'powerGeneration', 'electricity', 'yield']),
      consumptionKwh: this.firstNumber(item, ['consumption', 'loadConsumption']),
      income: this.firstNumber(item, ['income', 'earning']),
      raw: item,
    }));
  }

  private selectPrimaryDevice(devices: Record<string, unknown>[]) {
    return (
      devices.find((item) => String(item.deviceType || '').toUpperCase().includes('INVERTER')) ||
      devices[0] ||
      {}
    );
  }

  private sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private firstNumber(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = this.toNumber(source[key]);
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private firstString(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = this.toString(source[key]);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return null;
      }

      const parsed = Number(normalized.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}
