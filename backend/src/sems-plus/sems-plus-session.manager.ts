import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';

export type SemsPlusCredentialOverrides = {
  account?: string | null;
  password?: string | null;
  portalUrl?: string | null;
};

export type SemsPlusSession = {
  apiBaseUrl: string;
  uid: string;
  token: string;
  timestamp: string | number;
  client: string;
  version: string;
  language: string;
};

type SemsPlusRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
};

type ResolvedCredentials = {
  account: string;
  password: string;
  portalUrl: string;
  regionApiUrl: string;
  language: string;
};

type CachedSession = {
  session: SemsPlusSession;
  expiresAt: number;
};

const REGION_APIS: Record<string, string> = {
  au: 'https://au-semsplus.goodwe.com',
  cn: 'https://cn-semsplus.goodwe.com',
  eu: 'https://eu-semsplus.goodwe.com',
  hk: 'https://hk-semsplus.goodwe.com',
  us: 'https://us-semsplus.goodwe.com',
};

const AUTH_ERROR_CODES = new Set(['C0602', 'C0607', '100002']);
const SUCCESS_CODES = new Set(['00000', '0']);

export class SemsPlusAuthenticationError extends Error {
  constructor(message = 'SEMS+ authentication expired or was rejected.') {
    super(message);
    this.name = 'SemsPlusAuthenticationError';
  }
}

@Injectable()
export class SemsPlusSessionManager {
  private readonly sessionCache = new Map<string, CachedSession>();

  constructor(private readonly configService: ConfigService) {}

  hasConfiguredCredentials() {
    return Boolean(this.readAccount() && this.readPassword());
  }

  async withSession<T>(
    overrides: SemsPlusCredentialOverrides,
    action: (session: SemsPlusSession) => Promise<T>,
  ): Promise<T> {
    const credentials = this.resolveCredentials(overrides);
    const cacheKey = this.cacheKey(credentials);
    const firstSession = await this.getOrCreateSession(credentials, cacheKey);

    try {
      return await action(firstSession);
    } catch (error) {
      if (!this.isAuthenticationError(error)) {
        throw error;
      }

      this.sessionCache.delete(cacheKey);
      const refreshedSession = await this.getOrCreateSession(credentials, cacheKey);
      return action(refreshedSession);
    }
  }

  isAuthenticationError(error: unknown) {
    return error instanceof SemsPlusAuthenticationError;
  }

  async request(
    session: SemsPlusSession,
    request: SemsPlusRequest,
  ): Promise<Record<string, unknown>> {
    this.assertReadOnlyRequest(request);
    const tokenDocument = JSON.stringify({
      uid: session.uid,
      timestamp: session.timestamp,
      token: session.token,
      client: session.client,
      version: session.version,
      language: session.language,
    });

    return this.requestJson(
      new URL(request.path, `${session.apiBaseUrl}/`).toString(),
      request,
      tokenDocument,
      session.language,
    );
  }

  private async getOrCreateSession(
    credentials: ResolvedCredentials,
    cacheKey: string,
  ) {
    const cached = this.sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const session = await this.login(credentials);
    this.sessionCache.set(cacheKey, {
      session,
      expiresAt: Date.now() + 25 * 60 * 1000,
    });
    return session;
  }

  private async login(credentials: ResolvedCredentials): Promise<SemsPlusSession> {
    const anonymousToken = JSON.stringify({
      uid: '',
      timestamp: 0,
      token: '',
      client: 'semsPlusWeb',
      version: '',
      language: credentials.language,
    });
    const response = await this.requestJson(
      new URL(
        '/web/sems/sems-user/api/v1/auth/cross-login',
        `${credentials.portalUrl}/`,
      ).toString(),
      {
        method: 'POST',
        path: '/web/sems/sems-user/api/v1/auth/cross-login',
        body: {
          account: credentials.account,
          pwd: this.encodePassword(credentials.password),
          agreement: 1,
          isLocal: false,
          isChinese: false,
        },
      },
      anonymousToken,
      credentials.language,
    );

    const data = this.asRecord(response.data);
    const token = this.readString(data, ['token']) || this.readString(response, ['token']);
    const uid = this.readString(data, ['uid']) || this.readString(response, ['uid']);
    if (!token || !uid) {
      throw new BadGatewayException({
        message: 'SEMS+ login succeeded but did not return a usable session.',
        provider: 'SEMS_PORTAL',
        errorCategory: 'SCHEMA_CHANGED',
      });
    }

    const apiCandidate =
      this.readString(data, ['api']) ||
      this.readString(response, ['api']) ||
      credentials.regionApiUrl;

    return {
      apiBaseUrl: this.normalizeAllowedOrigin(apiCandidate, 'SEMS+ API URL'),
      uid,
      token,
      timestamp:
        this.readString(data, ['timestamp']) ||
        this.readString(response, ['timestamp']) ||
        Date.now(),
      client:
        this.readString(data, ['client']) ||
        this.readString(response, ['client']) ||
        'semsPlusWeb',
      version:
        this.readString(data, ['version']) ||
        this.readString(response, ['version']) ||
        '',
      language:
        this.readString(data, ['language']) ||
        this.readString(response, ['language']) ||
        credentials.language,
    };
  }

  private async requestJson(
    url: string,
    request: SemsPlusRequest,
    tokenDocument: string,
    language: string,
  ) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.requestJsonOnce(
          url,
          request,
          tokenDocument,
          language,
        );
      } catch (error) {
        lastError = error;
        if (!this.isRecoverableProviderError(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  private async requestJsonOnce(
    url: string,
    request: SemsPlusRequest,
    tokenDocument: string,
    language: string,
  ): Promise<Record<string, unknown>> {
    this.normalizeAllowedOrigin(url, 'SEMS+ request URL');
    const controller = new AbortController();
    const configuredTimeoutMs = Number(
      this.configService.get('SEMS_PLUS_TIMEOUT_MS') || 20000,
    );
    const timeoutMs = Number.isFinite(configuredTimeoutMs)
      ? Math.max(1000, configuredTimeoutMs)
      : 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: request.method,
        headers: {
          Accept: 'application/json, text/plain, */*',
          ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          token: tokenDocument,
          'X-Signature': this.encodeSignature(tokenDocument),
          currentLang: language,
          uuid: randomUUID(),
          os: 'MokaSolar Backend',
          brand: 'MokaSolar',
        },
        body: request.method === 'POST' ? JSON.stringify(request.body || {}) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = this.parseJson(text);
      const code = payload.code === undefined ? null : String(payload.code);

      if (response.status === 401 || response.status === 403 || (code && AUTH_ERROR_CODES.has(code))) {
        throw new SemsPlusAuthenticationError();
      }

      if (!response.ok) {
        throw new BadGatewayException({
          message: `SEMS+ request failed with HTTP ${response.status}.`,
          provider: 'SEMS_PORTAL',
          statusCode: response.status,
          errorCategory: response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
        });
      }

      if (code !== null && !SUCCESS_CODES.has(code)) {
        throw new BadGatewayException({
          message: 'SEMS+ rejected the read-only request.',
          provider: 'SEMS_PORTAL',
          code,
          errorCategory: 'PROVIDER_ERROR',
        });
      }

      return payload;
    } catch (error) {
      if (
        error instanceof SemsPlusAuthenticationError ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      throw new BadGatewayException({
        message: 'SEMS+ request failed before a valid response was received.',
        provider: 'SEMS_PORTAL',
        errorCategory: 'PROVIDER_ERROR',
        detail: error instanceof Error ? error.name : 'Unknown network error',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertReadOnlyRequest(request: SemsPlusRequest) {
    const allowed =
      (request.method === 'GET' &&
        request.path === '/web/sems/sems-user/api/v1/user/get-user') ||
      (request.method === 'GET' &&
        request.path === '/sems/sems-dashboard-web/api/front/page/getStationType') ||
      (request.method === 'POST' &&
        request.path === '/sems/sems-dashboard-web/api/front/page/stationPage') ||
      (request.method === 'GET' &&
        request.path.startsWith('/sems/sems-dashboard-web/api/front/page/stationDetail/'));

    if (!allowed) {
      throw new BadRequestException('SEMS+ request is not in the read-only allowlist.');
    }
  }

  private isRecoverableProviderError(error: unknown) {
    if (!(error instanceof BadGatewayException)) return false;
    const response = error.getResponse();
    if (!response || typeof response !== 'object') return false;
    const statusCode = Number((response as Record<string, unknown>).statusCode || 0);
    return statusCode === 429 || statusCode >= 500;
  }

  private resolveCredentials(overrides: SemsPlusCredentialOverrides): ResolvedCredentials {
    const account = String(overrides.account ?? this.readAccount()).trim();
    // Password whitespace can be intentional, so preserve the configured value exactly.
    const password = String(overrides.password ?? this.readPassword());
    if (!account || !password) {
      throw new BadRequestException(
        'Missing SEMS_PLUS_ACCOUNT or SEMS_PLUS_PASSWORD for server-side discovery.',
      );
    }

    const region = String(this.configService.get('SEMS_PLUS_REGION') || 'hk')
      .trim()
      .toLowerCase();
    const regionApiUrl = REGION_APIS[region];
    if (!regionApiUrl) {
      throw new BadRequestException(
        'SEMS_PLUS_REGION must be one of: au, cn, eu, hk, us.',
      );
    }

    const portalUrl = this.normalizeAllowedOrigin(
      String(
        overrides.portalUrl ||
          this.configService.get('SEMS_PLUS_PORTAL_URL') ||
          'https://semsplus.goodwe.com',
      ),
      'SEMS+ portal URL',
    );

    return {
      account,
      password,
      portalUrl,
      regionApiUrl,
      language: String(this.configService.get('SEMS_PLUS_LANGUAGE') || 'en').trim() || 'en',
    };
  }

  private normalizeAllowedOrigin(value: string, label: string) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException(`${label} is invalid.`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const officialHostname =
      hostname === 'semsplus.goodwe.com' ||
      /^(au|cn|eu|hk|us)-semsplus\.goodwe\.com$/.test(hostname);
    if (
      parsed.protocol !== 'https:' ||
      !officialHostname
    ) {
      throw new BadRequestException(`${label} must use an official HTTPS SEMS+ host.`);
    }

    return parsed.origin;
  }

  private readAccount() {
    return (
      this.configService.get<string>('SEMS_PLUS_ACCOUNT') ||
      this.configService.get<string>('SEMS_ACCOUNT') ||
      ''
    ).trim();
  }

  private readPassword() {
    return String(
      this.configService.get<string>('SEMS_PLUS_PASSWORD') ||
        this.configService.get<string>('SEMS_PASSWORD') ||
        '',
    );
  }

  private encodePassword(password: string) {
    const md5Hex = createHash('md5').update(password, 'utf8').digest('hex');
    return Buffer.from(md5Hex, 'utf8').toString('base64');
  }

  private encodeSignature(tokenDocument: string) {
    let token: Record<string, unknown> = {};
    try {
      token = JSON.parse(tokenDocument) as Record<string, unknown>;
    } catch {
      token = {};
    }
    const timestamp = Date.now();
    const uid = this.readString(token, ['uid']) || '';
    const tokenValue = this.readString(token, ['token']) || '';
    const hash = createHash('sha256')
      .update(`${timestamp}@${uid}@${tokenValue}`, 'utf8')
      .digest('hex');
    return Buffer.from(`${hash}@${timestamp}`, 'utf8').toString('base64');
  }

  private cacheKey(credentials: ResolvedCredentials) {
    const secretFingerprint = createHash('sha256')
      .update(`${credentials.account}\n${credentials.password}`, 'utf8')
      .digest('hex');
    return `${credentials.portalUrl}|${credentials.regionApiUrl}|${secretFingerprint}`;
  }

  private parseJson(text: string) {
    try {
      return JSON.parse(text || '{}') as Record<string, unknown>;
    } catch {
      throw new BadGatewayException({
        message: 'SEMS+ returned an invalid JSON response.',
        provider: 'SEMS_PORTAL',
        errorCategory: 'SCHEMA_CHANGED',
      });
    }
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(source: Record<string, unknown>, keys: readonly string[]) {
    for (const key of keys) {
      const value = source[key];
      if (value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }
    }
    return null;
  }
}
