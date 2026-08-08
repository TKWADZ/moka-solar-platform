import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { decryptSolarmanSecret, encryptSolarmanSecret } from './solarman-secret.crypto';
import { SolarmanWebOAuthClient, SolarmanWebOAuthRefreshError } from './solarman-web-oauth.client';
import { SolarmanWebOAuthProvider } from './solarman-web-oauth.provider';
import { SolarmanWebOAuthTokenService } from './solarman-web-oauth-token.service';

function config(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as ConfigService;
}

function tokenHarness(options: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshResult?: {
    accessToken: string;
    rotatedRefreshToken: string | null;
    expiresInSeconds: number;
  };
  refreshError?: Error;
  refreshDelayMs?: number;
}) {
  const configService = config({ SOLARMAN_SETTINGS_SECRET: 'fixture-encryption-key' });
  const record: Record<string, any> = {
    id: 'fixture-connection',
    status: 'VERIFIED',
    accessToken: null,
    refreshToken: null,
    accessTokenEncrypted: options.accessToken
      ? encryptSolarmanSecret(options.accessToken, configService)
      : null,
    refreshTokenEncrypted: options.refreshToken
      ? encryptSolarmanSecret(options.refreshToken, configService)
      : null,
    accessTokenExpiresAt: options.expiresAt || null,
    lastSuccessfulRefreshAt: null,
    deletedAt: null,
  };
  let refreshCalls = 0;
  const transaction = {
    solarmanConnection: {
      findFirst: async () => ({ ...record }),
      update: async ({ data }: any) => {
        Object.assign(record, data);
        return { ...record };
      },
    },
  };
  let lockTail = Promise.resolve();
  const lockService = {
    withRefreshLock: async (_id: string, operation: (tx: any) => Promise<any>) => {
      const result = lockTail.then(() => operation(transaction));
      lockTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const oauthClient = {
    refresh: async () => {
      refreshCalls += 1;
      if (options.refreshDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.refreshDelayMs));
      }
      if (options.refreshError) {
        throw options.refreshError;
      }
      return (
        options.refreshResult || {
          accessToken: 'fixture-new-access',
          rotatedRefreshToken: 'fixture-new-refresh',
          expiresInSeconds: 3600,
        }
      );
    },
  };
  const prisma = {
    solarmanConnection: {
      updateMany: async ({ data }: any) => {
        Object.assign(record, data);
        return { count: 1 };
      },
    },
  };
  const service = new SolarmanWebOAuthTokenService(
    lockService as any,
    oauthClient as any,
    configService,
    prisma as any,
  );

  return {
    service,
    record,
    configService,
    refreshCalls: () => refreshCalls,
  };
}

describe('SOLARMAN web OAuth refresh-token mode', () => {
  it('refreshes without Cookie or browser authentication headers', async () => {
    const originalFetch = globalThis.fetch;
    let captured: RequestInit | undefined;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(
        JSON.stringify({
          access_token: 'fixture-access',
          refresh_token: 'fixture-rotated-refresh',
          expires_in: 86400,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const client = new SolarmanWebOAuthClient(config());
      const result = await client.refresh('fixture-refresh');
      const headers = captured?.headers as Record<string, string>;
      const body = new URLSearchParams(String(captured?.body));

      assert.equal(result.accessToken, 'fixture-access');
      assert.equal(result.rotatedRefreshToken, 'fixture-rotated-refresh');
      assert.equal(headers.Cookie, undefined);
      assert.equal(headers.Authorization, undefined);
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('client_id'), 'test');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('atomically replaces a rotated refresh token', async () => {
    const harness = tokenHarness({ refreshToken: 'fixture-old-refresh' });
    await harness.service.getValidSession('fixture-connection');

    assert.equal(harness.refreshCalls(), 1);
    assert.equal(
      decryptSolarmanSecret(harness.record.refreshTokenEncrypted, harness.configService),
      'fixture-new-refresh',
    );
    assert.equal(harness.record.refreshToken, null);
    assert.equal(harness.record.accessToken, null);
  });

  it('retains the current refresh token when SOLARMAN does not rotate it', async () => {
    const harness = tokenHarness({
      refreshToken: 'fixture-current-refresh',
      refreshResult: {
        accessToken: 'fixture-new-access',
        rotatedRefreshToken: null,
        expiresInSeconds: 3600,
      },
    });
    await harness.service.getValidSession('fixture-connection');

    assert.equal(
      decryptSolarmanSecret(harness.record.refreshTokenEncrypted, harness.configService),
      'fixture-current-refresh',
    );
  });

  it('serializes concurrent refreshes with one per-connection lock', async () => {
    const harness = tokenHarness({
      refreshToken: 'fixture-current-refresh',
      refreshDelayMs: 20,
    });
    const [first, second] = await Promise.all([
      harness.service.getValidSession('fixture-connection'),
      harness.service.getValidSession('fixture-connection'),
    ]);

    assert.equal(harness.refreshCalls(), 1);
    assert.equal(first.token, 'fixture-new-access');
    assert.equal(second.token, 'fixture-new-access');
  });

  it('refreshes proactively when the stored access token is near expiry', async () => {
    const harness = tokenHarness({
      accessToken: 'fixture-expiring-access',
      refreshToken: 'fixture-current-refresh',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const session = await harness.service.getValidSession('fixture-connection');

    assert.equal(harness.refreshCalls(), 1);
    assert.equal(session.token, 'fixture-new-access');
  });

  it('marks the connection AUTH_REQUIRED when refresh is rejected', async () => {
    const harness = tokenHarness({
      refreshToken: 'fixture-rejected-refresh',
      refreshError: new SolarmanWebOAuthRefreshError(
        'fixture rejection',
        'AUTH_REQUIRED',
        true,
        401,
      ),
    });

    await assert.rejects(() => harness.service.getValidSession('fixture-connection'));
    assert.equal(harness.record.status, 'AUTH_REQUIRED');
    assert.equal(harness.record.lastRefreshErrorCode, 'AUTH_REQUIRED');
    assert.ok(harness.record.reauthorizationRequiredAt instanceof Date);
  });

  it('encrypts a legacy plaintext refresh token even when refresh is rejected', async () => {
    const harness = tokenHarness({
      refreshError: new SolarmanWebOAuthRefreshError(
        'fixture rejection',
        'AUTH_REQUIRED',
        true,
        401,
      ),
    });
    harness.record.refreshToken = 'fixture-legacy-refresh';

    await assert.rejects(() => harness.service.getValidSession('fixture-connection'));

    assert.equal(harness.record.refreshToken, null);
    assert.equal(
      decryptSolarmanSecret(harness.record.refreshTokenEncrypted, harness.configService),
      'fixture-legacy-refresh',
    );
  });

  it('discovers four stations without invoking password login', async () => {
    const sessions: any[] = [];
    const client = {
      testConnection: async (credentials: any, options: any) => {
        assert.equal(credentials.password, undefined);
        sessions.push(options.persistedSession);
        return {
          mode: 'web',
          session: options.persistedSession,
          stations: Array.from({ length: 4 }, (_, index) => ({
            stationId: `fixture-station-${index + 1}`,
            stationName: `Fixture station ${index + 1}`,
          })),
          sampleDevices: [],
          rawResponses: { plantList: { total: 4 }, deviceList: null },
        };
      },
    };
    const tokenService = {
      getValidSession: async () => ({
        mode: 'web',
        token: 'fixture-access',
        authorizationScheme: 'bearer',
        allowCookies: false,
      }),
      refreshAfterRejection: async () => {
        throw new Error('unexpected retry');
      },
    };
    const provider = new SolarmanWebOAuthProvider(client as any, tokenService as any);
    const result = await provider.testConnection({
      connectionId: 'fixture-connection',
      usernameOrEmail: 'fixture-user',
    });

    assert.equal(result.stations.length, 4);
    assert.equal(sessions[0].allowCookies, false);
    assert.equal(sessions[0].cookieJar, undefined);
  });
});
