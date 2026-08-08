import * as assert from 'node:assert/strict';
import { BadGatewayException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SemsPlusPlantDiscoveryAdapter } from '../systems/provider-discovery/sems-plus-plant-discovery.adapter';
import {
  SEMS_PLUS_ENV_CONNECTION_ID,
  SemsPlusClientService,
} from './sems-plus-client.service';
import {
  buildSemsPlusLiveDiscoveryReport,
  formatSemsPlusLiveDiscoveryReport,
} from './sems-plus-live-discovery.cli';
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
            providerSessionField: 'fixture-session-metadata',
          },
        };
      } else if (url.includes('/user/get-user')) {
        body = fixture('profile.json');
      } else if (url.includes('/getStationType')) {
        body = fixture('station-types.json');
      } else if (url.includes('/stationPage')) {
        body = fixture('station-page.json');
      } else if (url.includes('/stationDetail/plant-fixture-offline')) {
        body = { code: '00000', data: { status: 0 } };
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
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.status, 'RUNNING');
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-offline')?.status, 'OFFLINE');
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.installedCapacityKwp, 12.5);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.todayGenerationKwh, 18.4);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.totalGenerationKwh, 8200.5);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-online')?.currentPowerKw, null);
      assert.equal(plants.find((item) => item.externalPlantId === 'plant-fixture-offline')?.todayGenerationKwh, null);

      const login = requests.find((item) => item.url.includes('/auth/cross-login'))!;
      const loginBody = JSON.parse(String(login.init?.body));
      assert.equal(loginBody.account, 'fixture-account');
      assert.notEqual(loginBody.pwd, 'fixture-password');
      assert.equal(typeof (login.init?.headers as Record<string, string>)['X-Signature'], 'string');

      const stationRequest = requests.find((item) => item.url.includes('/stationPage'))!;
      const stationBody = JSON.parse(String(stationRequest.init?.body));
      const stationHeaders = stationRequest.init?.headers as Record<string, string>;
      const stationTokenDocument = JSON.parse(stationHeaders.token);
      assert.equal(stationBody.stationTypeEnum, 'PV');
      assert.deepEqual(stationBody.order, { column: 'createTime', asc: false });
      assert.equal(stationTokenDocument.providerSessionField, 'fixture-session-metadata');
      assert.equal(stationTokenDocument.language, 'en');
      assert.match(stationHeaders.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('paginates seven base plants, merges details by ID and retains detail failures', async () => {
    const originalFetch = globalThis.fetch;
    const stationRows = Array.from({ length: 7 }, (_, index) => ({
      id: `plant-fixture-${index + 1}`,
      name: `Fixture Plant ${index + 1}`,
      stationAddress: `Fixture address ${index + 1}`,
      status: index < 5 ? 'RUNNING' : 'OFFLINE',
      installedPower: 10 + index,
      ...(index === 6 ? {} : { productionToday: index + 1 }),
      productionTotal: 1000 + index,
      pSystem: 5000 + index,
    }));
    let stationPageRequests = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/cross-login')) {
        return new Response(
          JSON.stringify({
            code: '00000',
            data: {
              uid: 'fixture-user-id',
              token: 'unit-test-session-value',
              api: 'https://hk-semsplus.goodwe.com',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/user/get-user')) {
        return new Response(JSON.stringify(fixture('profile.json')), { status: 200 });
      }
      if (url.includes('/getStationType')) {
        return new Response(JSON.stringify(fixture('station-types.json')), { status: 200 });
      }
      if (url.includes('/stationPage')) {
        stationPageRequests += 1;
        const body = JSON.parse(String(init?.body));
        const start = (Number(body.current) - 1) * Number(body.size);
        return new Response(
          JSON.stringify({
            code: '00000',
            data: {
              total: stationRows.length,
              dataList: stationRows.slice(start, start + Number(body.size)),
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/stationDetail/plant-fixture-7')) {
        return new Response(JSON.stringify({ code: 'DETAIL_UNAVAILABLE' }), { status: 400 });
      }
      if (url.includes('/stationDetail/')) {
        const plantId = url.split('/').pop() || '';
        const row = stationRows.find((item) => item.id === plantId) || {};
        return new Response(JSON.stringify({ code: '00000', data: row }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    try {
      const liveConfig = config({ SEMS_PLUS_PAGE_SIZE: '3' });
      const manager = new SemsPlusSessionManager(liveConfig);
      const client = new SemsPlusClientService(manager, liveConfig);
      const result = await client.discoverPlants({
        account: 'fixture-account',
        password: 'fixture-password',
        region: 'hk',
      });

      assert.equal(stationPageRequests, 3);
      assert.equal(result.plants.length, 7);
      assert.equal(new Set(result.plants.map((plant) => plant.plantId)).size, 7);
      assert.equal(result.plants.find((plant) => plant.plantId === 'plant-fixture-7')?.status, 'OFFLINE');
      assert.equal(result.plants.find((plant) => plant.plantId === 'plant-fixture-7')?.todayGenerationKwh, null);
      assert.equal(result.diagnostics.profileHttpStatus, 200);
      assert.equal(result.diagnostics.profileProviderStatus, '00000');
      assert.equal(result.diagnostics.roleKey, 'PLANT_OWNER');
      assert.equal(result.diagnostics.userType, 'Owner');
      assert.equal(result.diagnostics.hasOrgId, false);
      assert.equal(result.diagnostics.permissionsCount, 0);
      assert.equal(result.diagnostics.stationTypeCount, 1);
      assert.equal(result.diagnostics.fullStationRowsReturned, 7);
      assert.equal(result.diagnostics.uniqueStationIdsReturned, 7);
      assert.equal(result.diagnostics.stationDetailSuccessCount, 6);
      assert.equal(result.diagnostics.stationDetailFailureCount, 1);
      assert.equal(result.diagnostics.finalMergedPlantCount, 7);

      const report = buildSemsPlusLiveDiscoveryReport(result, 'Plant 7');
      const output = formatSemsPlusLiveDiscoveryReport(report);
      assert.equal(report.expectedPlantMatched, true);
      assert.deepEqual(report.statusCounts, { online: 5, offline: 2, other: 0 });
      assert.equal(report.plantsWithTodayGeneration, 6);
      assert.equal(report.plantsWithTotalGeneration, 7);
      assert.doesNotMatch(output, /Fixture Plant/);
      assert.doesNotMatch(output, /Fixture address/);
      assert.doesNotMatch(output, /unit-test-session-value/);
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
            tokenDocument: {
              uid: 'fixture-user',
              token: 'unit-test-session',
            },
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

  it('reports provider failures with safe endpoint/status metadata only', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 'FIXTURE_REJECTED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    try {
      const manager = new SemsPlusSessionManager(config());
      await assert.rejects(
        () =>
          manager.request(
            {
              apiBaseUrl: 'https://hk-semsplus.goodwe.com',
              tokenDocument: {
                uid: 'fixture-user',
                token: 'unit-test-session-must-not-leak',
              },
              language: 'en',
            },
            {
              method: 'GET',
              path: '/web/sems/sems-user/api/v1/user/get-user',
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof BadGatewayException);
          const response = error.getResponse() as Record<string, unknown>;
          assert.equal(response.endpoint, '/web/sems/sems-user/api/v1/user/get-user');
          assert.equal(response.httpStatus, 400);
          assert.equal(response.providerCode, 'FIXTURE_REJECTED');
          assert.equal(response.sessionCreated, true);
          assert.doesNotMatch(JSON.stringify(response), /unit-test-session-must-not-leak/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to the selected official region when login returns an unsupported host', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          code: '00000',
          data: {
            uid: 'fixture-user',
            token: 'unit-test-session',
            api: 'https://untrusted.example.invalid',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    try {
      const manager = new SemsPlusSessionManager(config());
      const apiBaseUrl = await manager.withSession(
        {
          account: 'fixture-account',
          password: 'fixture-password',
          region: 'hk',
        },
        async (session) => session.apiBaseUrl,
      );
      assert.equal(apiBaseUrl, 'https://hk-semsplus.goodwe.com');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
