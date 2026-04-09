import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  ParsedSolarmanDailyHistory,
  ParsedSolarmanDevice,
  ParsedSolarmanMonthlyHistory,
  ParsedSolarmanStation,
  asRecord,
  parseDailyGeneration,
  parseDeviceList,
  parseMonthlyGeneration,
  parseStationList,
  toStringValue,
} from './solarman.parser';

type SolarmanCredentialConfig = {
  usernameOrEmail: string;
  password: string;
};

export type SolarmanProviderType = 'OFFICIAL_OPENAPI' | 'COOKIE_SESSION' | 'MANUAL_IMPORT';

type SolarmanMode = 'official' | 'web';
type SolarmanRequestMethod = 'GET' | 'POST';

type SolarmanBaseConfig = {
  baseUrl: string;
  appId: string | null;
  appSecret: string | null;
  dailyEndpoints: string[];
  monthlyEndpoints: string[];
  webLoginUrl: string | null;
  webStationListUrl: string | null;
  webDeviceListUrls: string[];
  webDailyUrls: string[];
  webMonthlyUrls: string[];
  webOrigin: string | null;
  webReferer: string | null;
  webExtraHeaders: Record<string, string>;
  webDefaultArea: string;
  webSystemCode: string;
  webLocale: string;
  webClientVersion: string;
  officialAvailable: boolean;
  webAvailable: boolean;
  preferredMode: SolarmanMode;
};

type SolarmanSession = {
  mode: SolarmanMode;
  token: string | null;
  authHeader: string | null;
  cookieJar: string | null;
};

export type SolarmanPersistedSession = {
  mode?: SolarmanMode | null;
  token?: string | null;
  cookieJar?: string | null;
};

type TokenCacheValue = {
  session: SolarmanSession;
  expiresAt: number;
};

type SolarmanRequestPlan = {
  method: SolarmanRequestMethod;
  endpoint: string;
  payload?: Record<string, unknown>;
  formUrlEncoded?: boolean;
};

type SolarmanRequestOptions = {
  mode?: SolarmanMode;
  persistedSession?: SolarmanPersistedSession | null;
  forceRelogin?: boolean;
};

@Injectable()
export class SolarmanClientService {
  private readonly timeoutMs: number;
  private readonly tokenCache = new Map<string, TokenCacheValue>();

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = Number(this.configService.get('REQUEST_TIMEOUT') || 20000);
  }

  primePersistedSession(
    credentials: SolarmanCredentialConfig,
    session: SolarmanPersistedSession,
    providerType: SolarmanProviderType = 'COOKIE_SESSION',
  ) {
    const mode = this.resolveModeFromProviderType(providerType);
    const config = this.resolveBaseConfig();
    const cacheKey = this.createCacheKey(credentials, mode, config);

    this.tokenCache.set(cacheKey, {
      session: {
        mode,
        token: session.token || null,
        authHeader: session.token || null,
        cookieJar: session.cookieJar || null,
      },
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
  }

  invalidateSession(
    credentials: SolarmanCredentialConfig,
    providerType: SolarmanProviderType = 'COOKIE_SESSION',
  ) {
    const config = this.resolveBaseConfig();
    const mode = this.resolveModeFromProviderType(providerType);
    this.tokenCache.delete(this.createCacheKey(credentials, mode, config));
  }

  async testConnection(
    credentials: SolarmanCredentialConfig,
    options: SolarmanRequestOptions = {},
  ) {
    const stationResult = await this.listStationsDetailed(credentials, options);
    const firstStation = stationResult.stations[0] || null;
    const deviceResult = firstStation
      ? await this.listDevicesDetailed(credentials, firstStation.stationId, {
          ...options,
          mode: stationResult.session.mode,
          persistedSession: stationResult.session,
        })
      : null;

    return {
      connected: true,
      mode: stationResult.session.mode,
      stationCount: stationResult.stations.length,
      tokenPreview: stationResult.session.token
        ? `${stationResult.session.token.slice(0, 10)}...`
        : null,
      cookieJar: stationResult.session.cookieJar,
      stations: stationResult.stations,
      sampleDevices: deviceResult?.devices || [],
      rawResponses: {
        plantList: stationResult.raw,
        deviceList: deviceResult?.raw || null,
      },
    };
  }

  async listStations(credentials: SolarmanCredentialConfig, options: SolarmanRequestOptions = {}) {
    const result = await this.listStationsDetailed(credentials, options);
    return result.stations;
  }

  async listStationsDetailed(
    credentials: SolarmanCredentialConfig,
    options: SolarmanRequestOptions = {},
  ) {
    const config = this.resolveBaseConfig();
    const modes = this.getModeOrder(config, options.mode);
    let lastError: unknown = null;

    for (const mode of modes) {
      try {
        if (mode === 'web') {
          const { stations, raw, session } = await this.listStationsViaWeb(credentials, config, options);
          if (stations.length) {
            return {
              mode,
              session,
              stations,
              raw,
            };
          }
          lastError = new Error('SOLARMAN web station list returned no stations.');
          continue;
        }

        const response = await this.requestWithAuth(
          credentials,
          {
            method: 'POST',
            endpoint: '/station/v1.0/list',
            payload: { page: 1, size: 200 },
          },
          'SOLARMAN station list',
          mode,
          options,
        );

        const stations = parseStationList(response.body);
        if (stations.length) {
          return {
            mode,
            session: response.session,
            stations,
            raw: response.body,
          };
        }

        lastError = new Error(`SOLARMAN station list returned no stations in ${mode} mode.`);
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Khong lay duoc danh sach station tu SOLARMAN. Hay kiem tra customer account hoac bo sung dung endpoint XHR web.',
      provider: 'SOLARMAN',
      detail: lastError instanceof Error ? lastError.message : 'Unknown station list error',
    });
  }

  async listDevices(
    credentials: SolarmanCredentialConfig,
    stationId: string,
    options: SolarmanRequestOptions = {},
  ) {
    const result = await this.listDevicesDetailed(credentials, stationId, options);
    return result.devices;
  }

  async listDevicesDetailed(
    credentials: SolarmanCredentialConfig,
    stationId: string,
    options: SolarmanRequestOptions = {},
  ) {
    const config = this.resolveBaseConfig();
    const modes = this.getModeOrder(config, options.mode);
    let lastError: unknown = null;

    for (const mode of modes) {
      if (mode === 'web') {
        const requests = this.buildWebDeviceRequests(config, stationId);
        for (const request of requests) {
          try {
            const response = await this.requestWithAuth(
              credentials,
              request,
              `SOLARMAN device list (${request.endpoint})`,
              mode,
              options,
            );
            const devices = parseDeviceList(response.body);
            if (devices.length) {
              return {
                mode,
                session: response.session,
                devices,
                raw: response.body,
              };
            }
          } catch (error) {
            lastError = error;
          }
        }

        continue;
      }

      const payloadCandidates = this.buildDevicePayloadCandidates(stationId);
      for (const payload of payloadCandidates) {
        try {
          const response = await this.requestWithAuth(
            credentials,
            {
              method: 'POST',
              endpoint: '/station/v1.0/device',
              payload,
            },
            'SOLARMAN device list',
            mode,
            options,
          );

          const devices = parseDeviceList(response.body);
          if (devices.length) {
            return {
              mode,
              session: response.session,
              devices,
              raw: response.body,
            };
          }
        } catch (error) {
          lastError = error;
        }
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Khong lay duoc danh sach thiet bi tu SOLARMAN.',
      provider: 'SOLARMAN',
      stationId,
      detail: lastError instanceof Error ? lastError.message : 'Unknown device list error',
    });
  }

  async getMonthlyGeneration(
    credentials: SolarmanCredentialConfig,
    stationId: string,
    year: number,
    options: SolarmanRequestOptions = {},
  ): Promise<ParsedSolarmanMonthlyHistory> {
    const result = await this.getMonthlyGenerationDetailed(credentials, stationId, year, options);
    return result.history;
  }

  async getMonthlyGenerationDetailed(
    credentials: SolarmanCredentialConfig,
    stationId: string,
    year: number,
    options: SolarmanRequestOptions = {},
  ) {
    const config = this.resolveBaseConfig();
    const payloadCandidates = this.buildMonthlyPayloadCandidates(stationId, year);
    const modes = this.getModeOrder(config, options.mode);
    let lastError: unknown = null;

    for (const mode of modes) {
      if (mode === 'web') {
        const webRequests = this.buildWebMonthlyRequests(config, stationId, year);
        for (const request of webRequests) {
          try {
            const response = await this.requestWithAuth(
              credentials,
              request,
              `SOLARMAN monthly history (${request.endpoint})`,
              mode,
              options,
            );

            const parsed = parseMonthlyGeneration(response.body);
            if (parsed && parsed.records.length) {
              return {
                mode,
                session: response.session,
                history: parsed,
                raw: response.body,
              };
            }
          } catch (error) {
            lastError = error;
          }
        }

        continue;
      }

      for (const endpoint of config.monthlyEndpoints) {
        for (const payload of payloadCandidates) {
          try {
            const response = await this.requestWithAuth(
              credentials,
              {
                method: 'POST',
                endpoint,
                payload,
              },
              `SOLARMAN monthly history (${endpoint})`,
              mode,
              options,
            );

            const parsed = parseMonthlyGeneration(response.body);
            if (parsed && parsed.records.length) {
              return {
                mode,
                session: response.session,
                history: parsed,
                raw: response.body,
              };
            }
          } catch (error) {
            lastError = error;
          }
        }
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Khong lay duoc lich su san luong PV theo thang tu SOLARMAN. Hay bo sung dung endpoint XHR monthly history neu tai khoan cua ban dung duong dan khac.',
      provider: 'SOLARMAN',
      stationId,
      year,
      detail: lastError instanceof Error ? lastError.message : 'Unknown monthly history error',
    });
  }

  async getDailyGenerationDetailed(
    credentials: SolarmanCredentialConfig,
    stationId: string,
    year: number,
    options: SolarmanRequestOptions = {},
  ) {
    const config = this.resolveBaseConfig();
    const modes = this.getModeOrder(config, options.mode);
    let lastError: unknown = null;

    for (const mode of modes) {
      if (mode === 'web') {
        const webRequests = this.buildWebDailyRequests(config, stationId, year);
        for (const request of webRequests) {
          try {
            const response = await this.requestWithAuth(
              credentials,
              request,
              `SOLARMAN daily history (${request.endpoint})`,
              mode,
              options,
            );
            const parsed = parseDailyGeneration(response.body);
            if (parsed && parsed.records.length) {
              return {
                mode,
                session: response.session,
                history: parsed,
                raw: response.body,
              };
            }
          } catch (error) {
            lastError = error;
          }
        }

        continue;
      }

      try {
        for (const endpoint of config.dailyEndpoints) {
          for (const payload of this.buildDailyPayloadCandidates(stationId, year)) {
            try {
              const response = await this.requestWithAuth(
                credentials,
                {
                  method: 'POST',
                  endpoint,
                  payload,
                },
                `SOLARMAN daily history (${endpoint})`,
                mode,
                options,
              );
              const parsed = parseDailyGeneration(response.body);
              if (parsed && parsed.records.length) {
                return {
                  mode,
                  session: response.session,
                  history: parsed,
                  raw: response.body,
                };
              }
            } catch (error) {
              lastError = error;
            }
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Khong lay duoc daily history tu SOLARMAN.',
      provider: 'SOLARMAN',
      stationId,
      year,
      detail: lastError instanceof Error ? lastError.message : 'Unknown daily history error',
    });
  }

  async login(credentials: SolarmanCredentialConfig, options: SolarmanRequestOptions = {}) {
    const config = this.resolveBaseConfig();
    const modes = this.getModeOrder(config, options.mode);
    let lastError: unknown = null;

    for (const mode of modes) {
      const cacheKey = this.createCacheKey(credentials, mode, config);
      if (options.forceRelogin === true) {
        this.tokenCache.delete(cacheKey);
      }

      if (options.persistedSession && mode === (options.persistedSession.mode || mode)) {
        this.primePersistedSession(
          credentials,
          {
            mode,
            token: options.persistedSession.token || null,
            cookieJar: options.persistedSession.cookieJar || null,
          },
          mode === 'web' ? 'COOKIE_SESSION' : 'OFFICIAL_OPENAPI',
        );
      }

      const cached = this.tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.session;
      }

      try {
        const session =
          mode === 'web'
            ? await this.loginWithWeb(credentials, config)
            : await this.loginWithOfficial(credentials, config);

        this.tokenCache.set(cacheKey, {
          session,
          expiresAt: Date.now() + 45 * 24 * 60 * 60 * 1000,
        });

        return session;
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Dang nhap SOLARMAN that bai. Hay kiem tra customer account hoac bo sung dung app id/app secret hay endpoint web.',
      provider: 'SOLARMAN',
      detail: lastError instanceof Error ? lastError.message : 'Unknown login error',
    });
  }

  private resolveBaseConfig(): SolarmanBaseConfig {
    const baseUrl = (
      this.configService.get<string>('SOLARMAN_BASE_URL') ||
      'https://globalapi.solarmanpv.com'
    ).replace(/\/$/, '');
    const appId = (this.configService.get<string>('SOLARMAN_APP_ID') || '').trim() || null;
    const appSecret =
      (this.configService.get<string>('SOLARMAN_APP_SECRET') || '').trim() || null;
    const dailyEndpoints = (
      this.configService.get<string>('SOLARMAN_DAILY_ENDPOINTS') ||
      [
        '/station/v1.0/history',
        '/station/v1.0/day',
        '/station/v1.0/history/day',
        '/station/v1.0/statistics/day',
        '/station/v1.0/energy/day',
      ].join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const monthlyEndpoints = (
      this.configService.get<string>('SOLARMAN_MONTHLY_ENDPOINTS') ||
      [
        '/station/v1.0/month',
        '/station/v1.0/monthly',
        '/station/v1.0/statistics/month',
        '/station/v1.0/statistics/monthly',
        '/station/v1.0/energy/month',
      ].join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const defaultWebOrigin =
      (this.configService.get<string>('SOLARMAN_WEB_ORIGIN') || '').trim() ||
      'https://globalhome.solarmanpv.com';
    const defaultWebReferer =
      (this.configService.get<string>('SOLARMAN_WEB_REFERER') || '').trim() ||
      `${defaultWebOrigin}/login`;
    const webLoginUrl =
      (this.configService.get<string>('SOLARMAN_WEB_LOGIN_URL') || '').trim() ||
      `${defaultWebOrigin}/oauth2-s/oauth/token`;
    const webStationListUrl =
      (this.configService.get<string>('SOLARMAN_WEB_STATION_LIST_URL') || '').trim() ||
      `${defaultWebOrigin}/maintain-s/operating/station/search`;
    const webDeviceListUrls = (
      this.configService.get<string>('SOLARMAN_WEB_DEVICE_LIST_URLS') ||
      this.configService.get<string>('SOLARMAN_WEB_DEVICE_LIST_URL') ||
      [
        `${defaultWebOrigin}/maintain-s/operating/device/search`,
        `${defaultWebOrigin}/maintain-s/operating/station/device/search`,
      ].join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const webDailyUrls = (
      this.configService.get<string>('SOLARMAN_WEB_DAILY_ENDPOINTS') ||
      this.configService.get<string>('SOLARMAN_WEB_DAILY_URL') ||
      [
        `${defaultWebOrigin}/maintain-s/history/power/{stationId}/record`,
        `${defaultWebOrigin}/maintain-s/history/power/{stationId}/stats/day`,
      ].join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const webMonthlyUrls = (
      this.configService.get<string>('SOLARMAN_WEB_MONTHLY_ENDPOINTS') ||
      this.configService.get<string>('SOLARMAN_WEB_MONTHLY_URL') ||
      [
        `${defaultWebOrigin}/maintain-s/history/power/{stationId}/record`,
        `${defaultWebOrigin}/maintain-s/history/power/{stationId}/stats/{type}`,
      ].join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const rawExtraHeaders =
      (this.configService.get<string>('SOLARMAN_WEB_EXTRA_HEADERS') || '{}').trim() || '{}';
    const preferredModeRaw =
      (this.configService.get<string>('SOLARMAN_PREFERRED_MODE') || 'auto').trim().toLowerCase();
    const webDefaultArea =
      (this.configService.get<string>('SOLARMAN_WEB_DEFAULT_AREA') || 'AS').trim().toUpperCase() ||
      'AS';
    const webSystemCode =
      (this.configService.get<string>('SOLARMAN_WEB_SYSTEM_CODE') || 'SOLARMAN').trim() ||
      'SOLARMAN';
    const webLocale =
      (this.configService.get<string>('SOLARMAN_WEB_LOCALE') || 'en').trim() || 'en';
    const webClientVersion =
      (this.configService.get<string>('SOLARMAN_WEB_CLIENT_VERSION') || 'web').trim() || 'web';
    const officialAvailable = Boolean(appId && appSecret);
    const webAvailable = Boolean(webLoginUrl && webStationListUrl && webMonthlyUrls.length);

    let webExtraHeaders: Record<string, string> = {};
    try {
      const parsed = JSON.parse(rawExtraHeaders) as Record<string, unknown>;
      webExtraHeaders = Object.fromEntries(
        Object.entries(parsed).flatMap(([key, value]) =>
          typeof value === 'string' && value.trim() ? [[key, value.trim()]] : [],
        ),
      );
    } catch {
      throw new BadRequestException(
        'SOLARMAN_WEB_EXTRA_HEADERS phai la JSON hop le neu ban co cau hinh them header.',
      );
    }

    if (preferredModeRaw === 'official' && !officialAvailable) {
      throw new BadRequestException(
        'Thieu SOLARMAN_APP_ID hoac SOLARMAN_APP_SECRET cho che do official API.',
      );
    }

    if (preferredModeRaw === 'web' && !webAvailable) {
      throw new BadRequestException(
        'Thieu SOLARMAN_WEB_LOGIN_URL, SOLARMAN_WEB_STATION_LIST_URL hoac SOLARMAN_WEB_MONTHLY_URL cho che do web XHR.',
      );
    }

    if (!officialAvailable && !webAvailable) {
      throw new BadRequestException(
        'Backend chua co cau hinh SOLARMAN. Can bo SOLARMAN_APP_ID/SECRET hoac bo SOLARMAN_WEB_* de sync that.',
      );
    }

    return {
      baseUrl,
      appId,
      appSecret,
      dailyEndpoints,
      monthlyEndpoints,
      webLoginUrl,
      webStationListUrl,
      webDeviceListUrls,
      webDailyUrls,
      webMonthlyUrls,
      webOrigin: defaultWebOrigin,
      webReferer: defaultWebReferer,
      webExtraHeaders,
      webDefaultArea,
      webSystemCode,
      webLocale,
      webClientVersion,
      officialAvailable,
      webAvailable,
      preferredMode:
        preferredModeRaw === 'web'
          ? 'web'
          : preferredModeRaw === 'official'
            ? 'official'
            : webAvailable
              ? 'web'
              : 'official',
    };
  }

  private async listStationsViaWeb(
    credentials: SolarmanCredentialConfig,
    config: SolarmanBaseConfig,
    options: SolarmanRequestOptions = {},
  ) {
    const payloadCandidates = [
      { page: 1, size: 200 },
      { pageNum: 1, pageSize: 200 },
      { current: 1, size: 200 },
      { pageNo: 1, pageSize: 200 },
      {},
    ];

    let lastError: unknown = null;

    for (const payload of payloadCandidates) {
      try {
        const response = await this.requestWithAuth(
          credentials,
          {
            method: 'POST',
            endpoint: config.webStationListUrl!,
            payload,
          },
          'SOLARMAN web station list',
          'web',
          options,
        );

        const stations = parseStationList(response.body);
        if (stations.length) {
          return {
            stations,
            raw: response.body,
            session: response.session,
          };
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return {
      stations: [] as ParsedSolarmanStation[],
      raw: {},
      session: await this.login(credentials, {
        ...options,
        mode: 'web',
      }),
    };
  }

  private buildWebMonthlyRequests(
    config: SolarmanBaseConfig,
    stationId: string,
    year: number,
  ): SolarmanRequestPlan[] {
    const queryCandidates = [
      { year },
      { year, dateType: 'month' },
      { year, type: 'month' },
      { year, statsType: 'month' },
      { year, timeType: 'month' },
      { year, dimension: 'month' },
    ];
    const statsTypes = ['month', 'monthly', '2', '3'];

    return config.webMonthlyUrls.flatMap((template) => {
      const templateWithStation = template
        .replace(/\{stationId\}/g, stationId)
        .replace(/\{year\}/g, String(year));

      const expanded = templateWithStation.includes('{type}')
        ? statsTypes.map((type) => templateWithStation.replace(/\{type\}/g, type))
        : [templateWithStation];

      return expanded.flatMap((endpoint) =>
        queryCandidates.map((payload) => ({
          method: 'GET' as const,
          endpoint,
          payload,
        })),
      );
    });
  }

  private async requestWithAuth(
    credentials: SolarmanCredentialConfig,
    plan: SolarmanRequestPlan,
    context: string,
    mode: SolarmanMode,
    options: SolarmanRequestOptions = {},
  ) {
    const config = this.resolveBaseConfig();
    const cacheKey = this.createCacheKey(credentials, mode, config);

    if (options.persistedSession && (options.persistedSession.mode || mode) === mode) {
      this.primePersistedSession(
        credentials,
        {
          mode,
          token: options.persistedSession.token || null,
          cookieJar: options.persistedSession.cookieJar || null,
        },
        mode === 'web' ? 'COOKIE_SESSION' : 'OFFICIAL_OPENAPI',
      );
    }

    const session = await this.loginForMode(credentials, mode);

    try {
      const response = await this.requestJson(plan, session, context, mode);
      return {
        ...response,
        session: {
          ...session,
          cookieJar: response.cookieJar || session.cookieJar,
        },
      };
    } catch (error) {
      if (!this.isAuthFailure(error)) {
        throw error;
      }

      this.tokenCache.delete(cacheKey);
      const freshSession = await this.login(credentials, {
        ...options,
        mode,
        forceRelogin: true,
      });
      const response = await this.requestJson(plan, freshSession, context, mode);
      return {
        ...response,
        session: {
          ...freshSession,
          cookieJar: response.cookieJar || freshSession.cookieJar,
        },
      };
    }
  }

  private async loginForMode(credentials: SolarmanCredentialConfig, mode: SolarmanMode) {
    const config = this.resolveBaseConfig();
    const cacheKey = this.createCacheKey(credentials, mode, config);
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const session =
      mode === 'web'
        ? await this.loginWithWeb(credentials, config)
        : await this.loginWithOfficial(credentials, config);

    this.tokenCache.set(cacheKey, {
      session,
      expiresAt: Date.now() + 45 * 24 * 60 * 60 * 1000,
    });

    return session;
  }

  private async loginWithOfficial(
    credentials: SolarmanCredentialConfig,
    config: SolarmanBaseConfig,
  ): Promise<SolarmanSession> {
    if (!config.officialAvailable || !config.appId || !config.appSecret) {
      throw new BadRequestException(
        'Chua co SOLARMAN_APP_ID va SOLARMAN_APP_SECRET de dang nhap official API.',
      );
    }

    const timeStamp = Date.now();
    const payloadCandidates = [
      {
        appId: config.appId,
        appSecret: config.appSecret,
        email: credentials.usernameOrEmail,
        password: credentials.password,
        timeStamp,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        email: credentials.usernameOrEmail,
        password: this.sha256(credentials.password),
        timeStamp,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        account: credentials.usernameOrEmail,
        pwd: credentials.password,
        timeStamp,
      },
      {
        appId: config.appId,
        appSecret: config.appSecret,
        account: credentials.usernameOrEmail,
        pwd: this.sha256(credentials.password),
        timeStamp,
      },
    ];

    let lastError: unknown = null;

    for (const payload of payloadCandidates) {
      try {
        const { body, cookieJar } = await this.requestJson(
          {
            method: 'POST',
            endpoint: '/account/v1.0/token',
            payload,
          },
          null,
          'SOLARMAN login',
          'official',
        );

        const token =
          toStringValue(body.access_token) ||
          toStringValue(body.token) ||
          toStringValue(asRecord(body.data).access_token) ||
          toStringValue(asRecord(body.data).token);

        if (token) {
          return {
            mode: 'official',
            token,
            authHeader: token,
            cookieJar,
          };
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Dang nhap SOLARMAN official API that bai.',
      provider: 'SOLARMAN',
      detail: lastError instanceof Error ? lastError.message : 'Unknown official login error',
    });
  }

  private async loginWithWeb(
    credentials: SolarmanCredentialConfig,
    config: SolarmanBaseConfig,
  ): Promise<SolarmanSession> {
    if (!config.webAvailable || !config.webLoginUrl) {
      throw new BadRequestException(
        'Chua co du bo SOLARMAN_WEB_LOGIN_URL, SOLARMAN_WEB_STATION_LIST_URL va SOLARMAN_WEB_MONTHLY_URL.',
      );
    }

    const loginIdentityType = this.inferIdentityType(credentials.usernameOrEmail);
    const preflightCookieJar = await this.bootstrapWebSession(config);

    const payloadCandidates = [
      {
        grant_type: 'mdc_password',
        username: credentials.usernameOrEmail,
        clear_text_pwd: credentials.password,
        password: this.md5(credentials.password),
        identity_type: loginIdentityType,
        client_id: 'test',
        system: config.webSystemCode,
        area: config.webDefaultArea,
      },
      {
        grant_type: 'mdc_password',
        username: credentials.usernameOrEmail,
        password: this.md5(credentials.password),
        identity_type: loginIdentityType,
        client_id: 'test',
        system: config.webSystemCode,
        area: config.webDefaultArea,
      },
      {
        grant_type: 'password',
        username: credentials.usernameOrEmail,
        password: this.md5(credentials.password),
        identity_type: loginIdentityType,
        client_id: 'test',
        system: config.webSystemCode,
        area: config.webDefaultArea,
      },
    ];

    let lastError: unknown = null;

    for (const payload of payloadCandidates) {
      try {
        const { body, cookieJar } = await this.requestJson(
          {
            method: 'POST',
            endpoint: config.webLoginUrl,
            payload,
            formUrlEncoded: true,
          },
          {
            mode: 'web',
            token: null,
            authHeader: null,
            cookieJar: preflightCookieJar,
          },
          'SOLARMAN web login',
          'web',
        );

        const token =
          toStringValue(body.access_token) ||
          toStringValue(body.token) ||
          toStringValue(body.accessToken) ||
          toStringValue(asRecord(body.data).access_token) ||
          toStringValue(asRecord(body.data).token) ||
          toStringValue(asRecord(body.data).accessToken);

        if (cookieJar || token) {
          return {
            mode: 'web',
            token,
            authHeader: token,
            cookieJar: this.mergeCookieJar(preflightCookieJar, cookieJar),
          };
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new BadGatewayException({
      message:
        lastError instanceof Error && lastError.message
          ? lastError.message
          : 'Dang nhap SOLARMAN web session that bai.',
      provider: 'SOLARMAN',
      detail: lastError instanceof Error ? lastError.message : 'Unknown web login error',
    });
  }

  private async bootstrapWebSession(config: SolarmanBaseConfig) {
    const target = config.webReferer || `${config.webOrigin}/login`;
    if (!target) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      return this.extractCookieJar(response, null);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestJson(
    plan: SolarmanRequestPlan,
    session: SolarmanSession | null,
    context: string,
    mode: SolarmanMode,
  ) {
    const config = this.resolveBaseConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = new URL(this.resolveUrl(plan.endpoint, config.baseUrl));

    if (plan.method === 'GET' && plan.payload) {
      for (const [key, value] of Object.entries(plan.payload)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
        ...(mode === 'web' ? this.buildWebHeaders(config) : {}),
        ...(session?.authHeader ? { Authorization: session.authHeader } : {}),
        ...(session?.cookieJar ? { Cookie: session.cookieJar } : {}),
      };

      let body: string | undefined;

      if (plan.method === 'POST') {
        if (plan.formUrlEncoded) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          body = new URLSearchParams(
            Object.entries(plan.payload || {}).flatMap(([key, value]) =>
              value === undefined || value === null ? [] : [[key, String(value)]],
            ),
          ).toString();
        } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(plan.payload || {});
        }
      }

      const response = await fetch(url.toString(), {
        method: plan.method,
        headers,
        body,
        signal: controller.signal,
      });

      const text = await response.text();
      const cookieJar = this.extractCookieJar(response, session?.cookieJar || null);
      let parsedBody: Record<string, unknown> = {};

      if (text.trim()) {
        try {
          parsedBody = JSON.parse(text) as Record<string, unknown>;
        } catch {
          if (!response.ok) {
            this.throwHttpError(response.status, context, text, undefined);
          }

          throw new BadGatewayException({
            message: `${context} tra ve du lieu khong hop le tu SOLARMAN.`,
            provider: 'SOLARMAN',
            statusCode: response.status,
            raw: text.slice(0, 500),
          });
        }
      }

      if (!response.ok) {
        this.throwHttpError(response.status, context, text, parsedBody);
      }

      if (parsedBody.success === false) {
        throw new BadGatewayException({
          message: `${context} khong thanh cong.`,
          provider: 'SOLARMAN',
          response: parsedBody,
        });
      }

      if (
        parsedBody.code !== undefined &&
        !['0', '200', 'None', 'null'].includes(String(parsedBody.code))
      ) {
        throw new BadGatewayException({
          message:
            toStringValue(parsedBody.message) ||
            toStringValue(parsedBody.msg) ||
            `${context} tra ve ma loi SOLARMAN.`,
          provider: 'SOLARMAN',
          code: parsedBody.code,
          response: parsedBody,
        });
      }

      return {
        body: parsedBody,
        cookieJar,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException({
        message: `${context} that bai khi goi toi SOLARMAN.`,
        provider: 'SOLARMAN',
        detail: error instanceof Error ? error.message : 'Unknown network error',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private throwHttpError(
    statusCode: number,
    context: string,
    rawText: string,
    parsedBody?: Record<string, unknown>,
  ): never {
    if (statusCode === 412) {
      throw new BadGatewayException({
        message:
          'SOLARMAN web dang yeu cau session/captcha hoac headers XHR day du hon. Can bo sung request XHR tu browser neu customer account dang bat xac minh truot.',
        provider: 'SOLARMAN',
        statusCode,
        response: parsedBody || rawText.slice(0, 500),
      });
    }

    throw new BadGatewayException({
      message: `${context} tra ve loi HTTP ${statusCode}.`,
      provider: 'SOLARMAN',
      statusCode,
      response: parsedBody || rawText.slice(0, 500),
    });
  }

  private buildMonthlyPayloadCandidates(stationId: string, year: number) {
    return [
      { systemId: Number(stationId), year },
      { stationId: Number(stationId), year },
      { powerStationId: Number(stationId), year },
      { id: Number(stationId), year },
      { systemId: String(stationId), year },
      { stationId: String(stationId), year },
      { powerStationId: String(stationId), year },
    ];
  }

  private buildDevicePayloadCandidates(stationId: string) {
    return [
      { stationId: Number(stationId), deviceType: 'INVERTER', page: 1, size: 100 },
      { systemId: Number(stationId), deviceType: 'INVERTER', page: 1, size: 100 },
      { stationId: String(stationId), deviceType: 'INVERTER', page: 1, size: 100 },
      { systemId: String(stationId), deviceType: 'INVERTER', page: 1, size: 100 },
      { stationId: Number(stationId), page: 1, size: 100 },
      { stationId: String(stationId), page: 1, size: 100 },
    ];
  }

  private buildDailyPayloadCandidates(stationId: string, year: number) {
    const candidates: Array<Record<string, unknown>> = [];

    for (let month = 1; month <= 12; month += 1) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      candidates.push(
        { stationId: Number(stationId), timeType: 2, startTime: startDate, endTime: endDate },
        { systemId: Number(stationId), timeType: 2, startTime: startDate, endTime: endDate },
        { stationId: String(stationId), timeType: 2, startTime: startDate, endTime: endDate },
        { systemId: String(stationId), timeType: 2, startTime: startDate, endTime: endDate },
        { stationId: Number(stationId), year, month },
        { systemId: Number(stationId), year, month },
        { stationId: String(stationId), year, month },
        { systemId: String(stationId), year, month },
      );
    }

    return candidates;
  }

  private createCacheKey(
    credentials: SolarmanCredentialConfig,
    mode: SolarmanMode,
    config: SolarmanBaseConfig,
  ) {
    const scope =
      mode === 'web'
        ? `${config.webLoginUrl}|${config.webStationListUrl}|${config.webMonthlyUrls.join(',')}|${config.webDefaultArea}|${config.webSystemCode}`
        : `${config.baseUrl}|${config.appId}`;

    return `${mode}|${scope}|${credentials.usernameOrEmail}|${this.sha256(credentials.password)}`;
  }

  private buildWebDeviceRequests(config: SolarmanBaseConfig, stationId: string): SolarmanRequestPlan[] {
    const payloadCandidates = [
      { stationId, page: 1, size: 100 },
      { systemId: stationId, page: 1, size: 100 },
      { stationId: Number(stationId), page: 1, size: 100 },
      { systemId: Number(stationId), page: 1, size: 100 },
      { stationId },
    ];

    return config.webDeviceListUrls.flatMap((endpoint) =>
      payloadCandidates.map((payload) => ({
        method: 'POST' as const,
        endpoint,
        payload,
      })),
    );
  }

  private buildWebDailyRequests(
    config: SolarmanBaseConfig,
    stationId: string,
    year: number,
  ): SolarmanRequestPlan[] {
    const requests: SolarmanRequestPlan[] = [];

    for (const template of config.webDailyUrls) {
      const endpoint = template
        .replace(/\{stationId\}/g, stationId)
        .replace(/\{year\}/g, String(year));

      for (let month = 1; month <= 12; month += 1) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        requests.push(
          {
            method: 'GET',
            endpoint,
            payload: { year, month, dateType: 'day' },
          },
          {
            method: 'GET',
            endpoint,
            payload: { startDate, endDate, type: 'day' },
          },
        );
      }
    }

    return requests;
  }

  private getModeOrder(config: SolarmanBaseConfig, preferredMode?: SolarmanMode): SolarmanMode[] {
    if (preferredMode) {
      return [preferredMode];
    }

    if (config.preferredMode === 'web') {
      return config.officialAvailable ? ['web', 'official'] : ['web'];
    }

    if (config.preferredMode === 'official') {
      return config.webAvailable ? ['official', 'web'] : ['official'];
    }

    if (config.webAvailable && config.officialAvailable) {
      return ['web', 'official'];
    }

    return config.webAvailable ? ['web'] : ['official'];
  }

  private resolveModeFromProviderType(providerType: SolarmanProviderType): SolarmanMode {
    return providerType === 'OFFICIAL_OPENAPI' ? 'official' : 'web';
  }

  private buildWebHeaders(config: SolarmanBaseConfig) {
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(config.webOrigin ? { Origin: config.webOrigin } : {}),
      ...(config.webReferer ? { Referer: config.webReferer } : {}),
      'log-platform-code': `${config.webSystemCode}_INTELLGENT`,
      'log-channel': 'Web',
      'log-client-version': config.webClientVersion,
      'log-area': config.webDefaultArea,
      'log-lan': config.webLocale,
      ...config.webExtraHeaders,
    };
  }

  private resolveUrl(pathOrUrl: string, baseUrl: string) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    return `${baseUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  private inferIdentityType(usernameOrEmail: string) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail.trim())) {
      return 2;
    }

    if (/^[+\d][\d-]{4,}$/.test(usernameOrEmail.trim())) {
      return 1;
    }

    return 3;
  }

  private isAuthFailure(error: unknown) {
    if (!(error instanceof BadGatewayException)) {
      return false;
    }

    const response = error.getResponse();
    if (!response || typeof response !== 'object') {
      return false;
    }

    const payload = response as Record<string, unknown>;
    const statusCode = Number(payload.statusCode || 0);
    const message = [
      typeof payload.message === 'string' ? payload.message : '',
      typeof payload.detail === 'string' ? payload.detail : '',
      typeof payload.msg === 'string' ? payload.msg : '',
    ]
      .join(' ')
      .toLowerCase();

    return (
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 412 ||
      message.includes('token') ||
      message.includes('auth') ||
      message.includes('session') ||
      message.includes('login')
    );
  }

  private extractCookieJar(response: Response, fallback: string | null) {
    const headerAny = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const rawSetCookies =
      typeof headerAny.getSetCookie === 'function'
        ? headerAny.getSetCookie()
        : response.headers.get('set-cookie')
          ? [response.headers.get('set-cookie') as string]
          : [];

    if (!rawSetCookies.length) {
      return fallback;
    }

    const newCookieJar = rawSetCookies
      .map((entry) => entry.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');

    return this.mergeCookieJar(fallback, newCookieJar);
  }

  private mergeCookieJar(existing: string | null, incoming: string | null) {
    const merged = new Map<string, string>();
    const append = (jar: string | null) => {
      if (!jar) {
        return;
      }

      for (const item of jar.split(';')) {
        const trimmed = item.trim();
        if (!trimmed) {
          continue;
        }
        const [name, ...rest] = trimmed.split('=');
        if (!name || !rest.length) {
          continue;
        }
        merged.set(name.trim(), `${name.trim()}=${rest.join('=').trim()}`);
      }
    };

    append(existing);
    append(incoming);

    return merged.size ? Array.from(merged.values()).join('; ') : null;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private md5(value: string) {
    return createHash('md5').update(value, 'utf8').digest('hex');
  }
}
