import { BadGatewayException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

@Injectable()
export class DeyeApiService {
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = Number(this.configService.get('REQUEST_TIMEOUT') || 20000);
  }

  async post(
    baseUrl: string,
    endpoint: string,
    payload: Record<string, unknown> | undefined,
    options?: {
      headers?: Record<string, string>;
      query?: Record<string, string | number | undefined | null>;
      retries?: number;
      description?: string;
    },
  ) {
    return this.request(baseUrl, endpoint, {
      method: 'POST',
      payload,
      headers: options?.headers,
      query: options?.query,
      retries: options?.retries,
      description: options?.description,
    });
  }

  private async request(
    baseUrl: string,
    endpoint: string,
    options: {
      method: 'POST';
      payload?: Record<string, unknown>;
      headers?: Record<string, string>;
      query?: Record<string, string | number | undefined | null>;
      retries?: number;
      description?: string;
    },
  ) {
    const retries = options.retries ?? 1;
    const url = this.buildUrl(baseUrl, endpoint, options.query);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: options.method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
            ...(options.headers || {}),
          },
          body: JSON.stringify(options.payload || {}),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const text = await response.text();
        const body = text
          ? this.tryParseJson(text)
          : null;

        if (!response.ok) {
          if (response.status >= 500 && attempt < retries) {
            lastError = new Error(
              `${options.description || endpoint} failed with ${response.status}`,
            );
            await this.sleep(350 * (attempt + 1));
            continue;
          }

          throw new BadGatewayException({
            message: `${options.description || endpoint} failed with status ${response.status}.`,
            provider: 'DEYE',
            statusCode: response.status,
            body,
          });
        }

        return body;
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new GatewayTimeoutException({
            message: `${options.description || endpoint} timed out.`,
            provider: 'DEYE',
          });
        }

        lastError = error;
        if (attempt < retries) {
          await this.sleep(350 * (attempt + 1));
          continue;
        }
      }
    }

    throw new BadGatewayException({
      message: `${options.description || endpoint} failed.`,
      provider: 'DEYE',
      detail: lastError instanceof Error ? lastError.message : 'Unknown Deye API error',
    });
  }

  private buildUrl(
    baseUrl: string,
    endpoint: string,
    query?: Record<string, string | number | undefined | null>,
  ) {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${normalizedBase}${normalizedEndpoint}`);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private tryParseJson(text: string): JsonValue {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }
}
