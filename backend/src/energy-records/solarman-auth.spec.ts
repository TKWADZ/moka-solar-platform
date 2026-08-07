import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { SolarmanService } from './solarman.service';

test('SOLARMAN token request uses appId query, SHA-256 password and bearer auth', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const payload = requests.length === 1 ? { access_token: 'token-value', expires_in: 3600 } : {};
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const config = {
    baseUrl: 'https://globalapi.solarmanpv.com',
    appId: 'app-id',
    appSecret: 'app-secret',
    username: 'operator@example.com',
    password: 'local-test-password',
    stationId: 123,
    timeType: 2,
    startDate: '2026-08-01',
    endDate: '2026-08-08',
  };

  try {
    const service = new SolarmanService();
    const token = await (service as any).ensureToken(config);
    await (service as any).postJson(
      config,
      '/station/v1.0/list',
      { page: 1, size: 1 },
      token,
      'SOLARMAN fixture request',
    );

    const tokenUrl = new URL(requests[0].url);
    const tokenBody = JSON.parse(String(requests[0].init?.body));
    assert.equal(tokenUrl.searchParams.get('appId'), 'app-id');
    assert.equal(tokenUrl.searchParams.get('language'), 'en');
    assert.equal(tokenBody.appId, undefined);
    assert.equal(tokenBody.email, 'operator@example.com');
    assert.equal(
      tokenBody.password,
      createHash('sha256').update('local-test-password', 'utf8').digest('hex'),
    );
    assert.equal((requests[1].init?.headers as Record<string, string>).Authorization, 'bearer token-value');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
