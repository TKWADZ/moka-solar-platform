import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SemsPlusPlantDiscoveryAdapter } from '../systems/provider-discovery/sems-plus-plant-discovery.adapter';
import {
  SEMS_PLUS_ENV_CONNECTION_ID,
  SemsPlusClientService,
} from './sems-plus-client.service';
import {
  SemsPlusAuthenticationError,
  SemsPlusSessionManager,
} from './sems-plus-session.manager';

const fixtureRoot = join(__dirname, '..', '..', 'test', 'fixtures', 'providers', 'sems-plus');

function fixture(name: string) {
  return JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8'));
}

function config(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SEMS_PLUS_ACCOUNT: 'fixture-account',
    SEMS_PLUS_PASSWORD: 'fixture-password',
    SEMS_PLUS_PORTAL_URL: 'https://semsplus.goodwe.com',
    SEMS_PLUS_REGION: 'hk',
    SEMS_PLUS_LANGUAGE: 'en',
    SEMS_PLUS_PAGE_SIZE: '200',
    SEMS_PLUS_TIMEOUT_MS: '5000',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as any;
}

describe('SEMS+ current read-only integration', () => {
  it('accepts PLANT_OWNER without orgId and retains offline plants', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      let body: Record<string, unknown>;
      if (url.includes('/auth/cross-login')) {
        body = {
          code: '00000',
          data: {
            uid: 'fixture-user-id',
            token: 'unit-test-session-value',
            timestamp: 1,
            client: 'semsPlusWeb',
            version: 'fixture',
            language: 'en',
            api: 'https://hk-semsplus.goodwe.com',
          },
        };
      } else if (url.includes('/user/get-user')) {
        body = fixture('profile.json');
      } else if (url.includes('/getStationType')) {
        body = fixture('station-types.json');
      } else if (url.includes('/stationPage')) {
        body = fixture('station-page.json');
      } else if (url.includes('/stationDetail/plant-fixture-offline')) {
        body = { code: '00000', data: { status: 'OFFLINE' } };
      } else if (url.includes('/stationDetail/')) {
        body = fixture('station-detail.json');
      } else {
        return new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const manager = new SemsPlusSessionManager(config());
      const client = new SemsPlusClientService(manager, config());
      const adapter = new SemsPlusPlantDiscoveryAdapter(client);
      const plants = await adapter.listPlants(SEMS_PLUS_ENV_CONNECTION_ID);

      assert.equal(plants.length, 2);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-offline')?.status, 'OFFLINE');
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.todayGenerationKwh, 18.4);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.currentPowerKw, null);

      const login = requests.find((item) => item.url.includes('/auth/cross-login'))!;
      const loginBody = JSON.parse(String(login.init?.body));
      assert.equal(loginBody.account, 'fixture-account');
      assert.notEqual(loginBody.pwd, 'fixture-password');
      assert.equal(typeof (login.init?.headers as Record<string, string>)['X-Signature'], 'string');

      const stationRequest = requests.find((item) => item.url.includes('/stationPage'))!;
      const stationBody = JSON.parse(String(stationRequest.init?.body));
      assert.equal(stationBody.stationTypeEnum, 'PV');
      assert.deepEqual(stationBody.order, { column: 'createTime', asc: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('refreshes an expired session once and does not loop', async () => {
    const originalFetch = globalThis.fetch;
    let loginCalls = 0;
    globalThis.fetch = (async () => {
      loginCalls += 1;
      return new Response(
        JSON.stringify({
          code: '00000',
          data: {
            uid: `fixture-user-${loginCalls}`,
            token: `unit-test-session-${loginCalls}`,
            api: 'https://hk-semsplus.goodwe.com',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const manager = new SemsPlusSessionManager(config());
      let actions = 0;
      const result = await manager.withSession({}, async () => {
        actions += 1;
        if (actions === 1) throw new SemsPlusAuthenticationError();
        return 'ok';
      });
      assert.equal(result, 'ok');
      assert.equal(loginCalls, 2);
      assert.equal(actions, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('blocks remote-control requests before any provider call', async () => {
    const manager = new SemsPlusSessionManager(config());
    await assert.rejects(
      () =>
        manager.request(
          {
            apiBaseUrl: 'https://hk-semsplus.goodwe.com',
            uid: 'fixture-user',
            token: 'unit-test-session',
            timestamp: 1,
            client: 'semsPlusWeb',
            version: 'fixture',
            language: 'en',
          },
          {
            method: 'POST',
            path: '/web/sems/sems-remote/api/v1/device/restart',
            body: {},
          },
        ),
      /read-only allowlist/,
    );
  });
});
