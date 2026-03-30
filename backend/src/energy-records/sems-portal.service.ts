import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { SemsSyncDto } from './dto/sems-sync.dto';

type SemsResolvedConfig = {
  account: string;
  password: string;
  plantId: string;
  loginUrl: string;
};

type SemsMonitorSnapshot = {
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
    info: Record<string, unknown>;
    kpi: Record<string, unknown>;
    inverter: Record<string, unknown>;
  };
};

@Injectable()
export class SemsPortalService {
  async fetchMonitorSnapshot(dto: SemsSyncDto): Promise<SemsMonitorSnapshot> {
    const config = this.resolveConfig(dto);
    const loginResponse = await this.login(config);
    const detailResponse = await this.fetchPowerStationDetail(config, loginResponse);

    return this.buildSnapshot(config.plantId, loginResponse.baseApi, detailResponse);
  }

  private resolveConfig(dto: SemsSyncDto): SemsResolvedConfig {
    const account = dto.account || process.env.SEMS_ACCOUNT;
    const password = dto.password || process.env.SEMS_PASSWORD;
    const loginUrl =
      dto.loginUrl ||
      process.env.SEMS_LOGIN_URL ||
      'https://hk.semsportal.com/api/v2/Common/CrossLogin';

    if (!account || !password) {
      throw new BadRequestException(
        'SEMS credentials are required. Provide account/password in the request or set SEMS_ACCOUNT and SEMS_PASSWORD.',
      );
    }

    return {
      account,
      password,
      plantId: dto.plantId,
      loginUrl,
    };
  }

  private async login(config: SemsResolvedConfig) {
    const response = await this.postJson(config.loginUrl, {
      headers: {
        'Content-Type': 'application/json',
        Token: JSON.stringify({
          version: 'v2.1.0',
          client: 'web',
          language: 'en',
        }),
      },
      body: {
        account: config.account,
        pwd: config.password,
        agreement_agreement: 0,
        is_local: false,
      },
      context: 'SEMS login',
    });

    if (response.code !== 0) {
      throw new BadGatewayException({
        message: 'SEMS login failed',
        provider: 'SEMS_PORTAL',
        code: response.code,
        msg: response.msg || response.message || 'Unknown SEMS login error',
      });
    }

    const data = (response.data || {}) as Record<string, unknown>;
    const fallbackBaseApi = new URL('/api/', config.loginUrl).toString();
    const baseApiRaw = String(response.api || fallbackBaseApi);
    const baseApi = baseApiRaw.endsWith('/') ? baseApiRaw : `${baseApiRaw}/`;

    return {
      baseApi,
      uid: String(data.uid || ''),
      timestamp: String(data.timestamp || ''),
      token: String(data.token || ''),
      client: String(data.client || 'web'),
      version: String(data.version || 'v2.1.0'),
      language: String(data.language || 'en'),
    };
  }

  private async fetchPowerStationDetail(
    config: SemsResolvedConfig,
    login: {
      baseApi: string;
      uid: string;
      timestamp: string;
      token: string;
      client: string;
      version: string;
      language: string;
    },
  ) {
    const detailUrl = `${login.baseApi}v2/PowerStation/GetMonitorDetailByPowerstationId`;

    return this.postJson(detailUrl, {
      headers: {
        'Content-Type': 'application/json',
        Token: JSON.stringify({
          version: login.version,
          client: login.client,
          language: login.language,
          timestamp: login.timestamp,
          uid: login.uid,
          token: login.token,
        }),
      },
      body: {
        powerStationId: config.plantId,
      },
      context: 'SEMS power station detail',
    });
  }

  private buildSnapshot(
    plantId: string,
    baseApi: string,
    detailResponse: Record<string, unknown>,
  ): SemsMonitorSnapshot {
    const data = this.asRecord(detailResponse.data);
    const info = this.asRecord(data.info);
    const kpi = this.asRecord(data.kpi);
    const inverter = this.firstRecord(data.inverter);

    return {
      provider: 'SEMS_PORTAL',
      plantId,
      plantName: this.firstString(info, ['stationname', 'stationName', 'name']),
      baseApi,
      currentPvKw: this.firstNumber(inverter, [
        'powerGeneration',
        'ppv',
        'pac',
        'power',
        'output_power',
      ]),
      batterySocPct: this.firstNumber(inverter, ['soc', 'batterySoc', 'battery_soc']),
      todayGeneratedKwh: this.firstNumber(kpi, [
        'power',
        'today_power',
        'todayPower',
        'daily_generation',
        'eday',
      ]),
      totalGeneratedKwh: this.firstNumber(kpi, [
        'total_power',
        'totalPower',
        'total_generation',
        'etotal',
      ]),
      todayLoadConsumedKwh: this.firstNumber(kpi, [
        'consume_power',
        'consumePower',
        'load_power',
        'loadPower',
        'usage_power',
      ]),
      todayGridImportedKwh: this.firstNumber(kpi, [
        'buy_power',
        'buyPower',
        'purchase_power',
        'grid_imported_kwh',
      ]),
      todayGridExportedKwh: this.firstNumber(kpi, [
        'sell_power',
        'sellPower',
        'feed_in_power',
        'grid_exported_kwh',
      ]),
      inverterSerial: this.firstString(inverter, ['sn', 'serialNum', 'serial_no']),
      inverterStatus: this.firstString(inverter, ['status', 'workMode']),
      fetchedAt: new Date().toISOString(),
      raw: {
        info,
        kpi,
        inverter,
      },
    };
  }

  private async postJson(
    url: string,
    options: {
      headers: Record<string, string>;
      body: Record<string, unknown>;
      context: string;
    },
  ) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify(options.body),
      });
    } catch (error) {
      throw new BadGatewayException({
        message: `${options.context} request failed`,
        provider: 'SEMS_PORTAL',
        detail: error instanceof Error ? error.message : 'Unknown network error',
      });
    }

    const text = await response.text();

    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException({
        message: `${options.context} returned invalid JSON`,
        provider: 'SEMS_PORTAL',
        statusCode: response.status,
        raw: text.slice(0, 500),
      });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        message: `${options.context} failed`,
        provider: 'SEMS_PORTAL',
        statusCode: response.status,
        response: parsed,
      });
    }

    return parsed;
  }

  private extractNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const matches = value.match(/[-+]?\d*\.?\d+/g);

      if (matches?.length) {
        const nextValue = Number(matches[0]);
        return Number.isFinite(nextValue) ? nextValue : null;
      }
    }

    return null;
  }

  private firstNumber(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = this.extractNumber(source[key]);
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private firstString(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
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

  private firstRecord(value: unknown) {
    if (Array.isArray(value) && value.length > 0) {
      return this.asRecord(value[0]);
    }

    return this.asRecord(value);
  }
}
