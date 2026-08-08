import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JsonRecord = Record<string, unknown>;

export class SolarmanWebOAuthRefreshError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly authRejected: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'SolarmanWebOAuthRefreshError';
  }
}

export type SolarmanWebOAuthRefreshResult = {
  accessToken: string;
  rotatedRefreshToken: string | null;
  expiresInSeconds: number;
};

@Injectable()
export class SolarmanWebOAuthClient {
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = Number(this.configService.get('REQUEST_TIMEOUT') || 20_000);
  }

  async refresh(refreshToken: string): Promise<SolarmanWebOAuthRefreshResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const origin = (
      this.configService.get<string>('SOLARMAN_WEB_ORIGIN') ||
      'https://home.solarmanpv.com'
    ).replace(/\/$/, '');
    const system = (
      this.configService.get<string>('SOLARMAN_WEB_SYSTEM_CODE') || 'SOLARMAN'
    ).trim();
    const area = (
      this.configService.get<string>('SOLARMAN_WEB_DEFAULT_AREA') || 'AS'
    )
      .trim()
      .toUpperCase();

    try {
      const response = await fetch(`${origin}/oauth2-s/oauth/token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: 'test',
          system,
          area,
          origin_id: '',
        }).toString(),
        signal: controller.signal,
      });
      const body = await this.readJson(response);

      if (!response.ok) {
        const rejected = [400, 401, 403].includes(response.status);
        throw new SolarmanWebOAuthRefreshError(
          rejected
            ? 'SOLARMAN refresh token was rejected. Manual authorization is required.'
            : `SOLARMAN token refresh failed with HTTP ${response.status}.`,
          rejected ? 'AUTH_REQUIRED' : `HTTP_${response.status}`,
          rejected,
          response.status,
        );
      }

      const accessToken = this.firstString(body, ['access_token']);
      if (!accessToken) {
        throw new SolarmanWebOAuthRefreshError(
          'SOLARMAN refresh response did not include an access token.',
          'INVALID_REFRESH_RESPONSE',
          false,
          response.status,
        );
      }

      return {
        accessToken,
        rotatedRefreshToken: this.firstString(body, ['refresh_token']) || null,
        expiresInSeconds: this.positiveNumber(body.expires_in) || 24 * 60 * 60,
      };
    } catch (error) {
      if (error instanceof SolarmanWebOAuthRefreshError) {
        throw error;
      }

      throw new SolarmanWebOAuthRefreshError(
        'SOLARMAN token refresh failed because the provider could not be reached.',
        'PROVIDER_UNAVAILABLE',
        false,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readJson(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as JsonRecord)
        : {};
    } catch {
      return {};
    }
  }

  private firstString(source: JsonRecord, keys: string[]) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private positiveNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
