import * as assert from 'node:assert/strict';
import { BadGatewayException } from '@nestjs/common';
import { describe, it } from 'node:test';
import { SolarmanClientService } from './solarman-client.service';
import { SolarmanConnectionsService } from './solarman-connections.service';
import {
  parseDailyGeneration,
  parseMonthlyGeneration,
  parseStationList,
} from './solarman.parser';

function config(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as any;
}

describe('SOLARMAN provider regression', () => {
  it('keeps official OpenAPI preferred and uses current web fallback endpoints', () => {
    const service = new SolarmanClientService(
      config({
        SOLARMAN_APP_ID: 'fixture-app-id',
        SOLARMAN_APP_SECRET: 'fixture-app-secret',
      }),
    );
    const resolved = (service as any).resolveBaseConfig();

    assert.equal(resolved.baseUrl, 'https://globalapi.solarmanpv.com');
    assert.equal(resolved.preferredMode, 'official');
    assert.equal(resolved.webOrigin, 'https://home.solarmanpv.com');
    assert.deepEqual(resolved.webDeviceListUrls, [
      'https://home.solarmanpv.com/maintain-s/power/system/deviceList',
    ]);
    assert.deepEqual(resolved.webDailyUrls, [
      'https://home.solarmanpv.com/maintain-s/history/power/{stationId}/stats/{type}',
    ]);
    assert.deepEqual(resolved.webMonthlyUrls, [
      'https://home.solarmanpv.com/maintain-s/history/power/{stationId}/stats/{type}',
    ]);

    assert.deepEqual((service as any).buildWebDeviceRequests(resolved, 'fixture-station'), [
      {
        method: 'POST',
        endpoint: 'https://home.solarmanpv.com/maintain-s/power/system/deviceList',
        payload: {
          'order.direction': 'ASC',
          'order.property': 'device_id',
          stationId: 'fixture-station',
        },
      },
    ]);
    assert.deepEqual((service as any).buildWebMonthlyRequests(resolved, 'fixture-station', 2026), [
      {
        method: 'GET',
        endpoint: 'https://home.solarmanpv.com/maintain-s/history/power/fixture-station/stats/year',
        payload: { year: 2026 },
      },
    ]);
    const dailyRequests = (service as any).buildWebDailyRequests(
      resolved,
      'fixture-station',
      2026,
    );
    assert.equal(dailyRequests.length, 12);
    assert.deepEqual(dailyRequests[0], {
      method: 'GET',
      endpoint: 'https://home.solarmanpv.com/maintain-s/history/power/fixture-station/stats/month',
      payload: { year: 2026, month: 1 },
    });
  });

  it('uses the verified Business web station-search request contract once', async () => {
    const service = new SolarmanClientService(config());
    const resolved = (service as any).resolveBaseConfig();
    const plans: Array<Record<string, unknown>> = [];
    (service as any).requestWithAuth = async (
      _credentials: unknown,
      plan: Record<string, unknown>,
    ) => {
      plans.push(plan);
      return {
        body: { total: 1, data: [{ id: 'fixture-station', name: 'Fixture station' }] },
        session: { mode: 'web', token: null, authHeader: null, cookieJar: 'fixture-cookie' },
      };
    };

    const result = await (service as any).listStationsViaWeb(
      { usernameOrEmail: 'fixture-user', password: 'fixture-password' },
      resolved,
      {},
    );

    assert.equal(result.stations.length, 1);
    assert.equal(plans.length, 1);
    assert.deepEqual(plans[0], {
      method: 'POST',
      endpoint: 'https://home.solarmanpv.com/maintain-s/operating/station/search',
      payload: {},
      query: {
        'order.direction': 'DESC',
        'order.property': 'id',
        page: 1,
        size: 200,
      },
    });
  });

  it('rejects authentication artifacts in configurable web headers', () => {
    const service = new SolarmanClientService(
      config({ SOLARMAN_WEB_EXTRA_HEADERS: '{"Authorization":"not-allowed"}' }),
    );

    assert.throws(
      () => (service as any).resolveBaseConfig(),
      /cannot contain authentication header Authorization/,
    );
  });

  it('maps verified SOLARMAN history fields and drops rows without PV production', () => {
    const monthly = parseMonthlyGeneration({
      statistics: { systemId: 'fixture-station', year: 2026 },
      records: [
        {
          year: 2026,
          month: 1,
          generationValue: 123.4,
          useValue: 234.5,
          buyValue: 45.6,
          gridValue: 34.5,
          chargeValue: 12.3,
          dischargeValue: 11.2,
        },
        { year: 2026, month: 2, useValue: 999 },
      ],
    });
    const daily = parseDailyGeneration({
      statistics: { systemId: 'fixture-station', year: 2026, month: 1 },
      records: [
        { year: 2026, month: 1, day: 1, generationValue: 4.5, useValue: 5.6 },
        { year: 2026, month: 1, day: 2, useValue: 6.7 },
      ],
    });

    assert.equal(monthly?.records.length, 1);
    assert.deepEqual(monthly?.records[0], {
      systemId: 'fixture-station',
      year: 2026,
      month: 1,
      pvGenerationKwh: 123.4,
      loadConsumedKwh: 234.5,
      gridImportedKwh: 45.6,
      gridExportedKwh: 34.5,
      batteryChargeKwh: 12.3,
      batteryDischargeKwh: 11.2,
      raw: {
        year: 2026,
        month: 1,
        generationValue: 123.4,
        useValue: 234.5,
        buyValue: 45.6,
        gridValue: 34.5,
        chargeValue: 12.3,
        dischargeValue: 11.2,
      },
    });
    assert.equal(daily?.records.length, 1);
    assert.equal(daily?.records[0].pvGenerationKwh, 4.5);
    assert.equal(daily?.records[0].loadConsumedKwh, 5.6);
  });

  it('normalizes SOLARMAN epoch timestamps and realtime watts before persistence', () => {
    const [station] = parseStationList({
      data: [
        {
          id: 65249141,
          name: 'Fixture station',
          generationPower: 1226,
          lastUpdateTime: 1786171604,
        },
      ],
    });

    assert.equal(station.generationPowerKw, 1.226);
    assert.equal(station.lastUpdateTime, '2026-08-08T06:46:44.000Z');
  });

  it('never passes an invalid SOLARMAN timestamp to Prisma system creation', async () => {
    let createData: Record<string, unknown> | undefined;
    const prisma = {
      solarSystem: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createData = data;
          return { id: 'fixture-system', ...data };
        },
      },
    };
    const service = new SolarmanConnectionsService(
      prisma as any,
      config(),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).resolveSystemForStation(
      {
        id: 'fixture-connection',
        customerId: null,
        defaultUnitPrice: 0,
        defaultTaxAmount: 0,
        defaultDiscountAmount: 0,
      },
      {
        stationId: 'fixture-station',
        stationName: 'Fixture station',
        sourceSystem: 'SOLARMAN',
        installedCapacityKw: 12,
        generationMonthKwh: 196,
        generationYearKwh: 3121,
        generationTotalKwh: 3157,
        generationPowerKw: 1.226,
        hasBattery: null,
        powerType: 'PV',
        powerMode: null,
        timezone: null,
        lastUpdateTime: 'not-a-provider-date',
        raw: {},
      },
      true,
    );

    assert.equal(createData?.latestMonitorAt, null);
    assert.equal(createData?.currentGenerationPowerKw, 1.226);
  });

  it('re-authenticates official OpenAPI once after an auth failure', async () => {
    const service = new SolarmanClientService(config());
    let requestCalls = 0;
    let reloginCalls = 0;
    (service as any).loginForMode = async () => ({
      mode: 'official', token: 'fixture-token', authHeader: 'bearer fixture-token', cookieJar: null,
    });
    (service as any).login = async () => {
      reloginCalls += 1;
      return {
        mode: 'official',
        token: 'fresh-fixture-token',
        authHeader: 'bearer fresh-fixture-token',
        cookieJar: null,
      };
    };
    (service as any).requestJson = async () => {
      requestCalls += 1;
      if (requestCalls === 1) {
        throw new BadGatewayException({ statusCode: 401, message: 'expired' });
      }
      return { body: { success: true }, cookieJar: null };
    };

    const result = await (service as any).requestWithAuth(
      { usernameOrEmail: 'fixture-user', password: 'fixture-password' },
      { method: 'GET', endpoint: '/fixture' },
      'fixture request',
      'official',
      {},
    );

    assert.equal(result.body.success, true);
    assert.equal(requestCalls, 2);
    assert.equal(reloginCalls, 1);
  });

  it('stops after one SOLARMAN web HTTP 412 and requires manual authorization', async () => {
    const service = new SolarmanClientService(config());
    let requestCalls = 0;
    let reloginCalls = 0;
    (service as any).loginForMode = async () => ({
      mode: 'web', token: null, authHeader: null, cookieJar: 'fixture-cookie',
    });
    (service as any).login = async () => {
      reloginCalls += 1;
      throw new Error('web password login must not be attempted');
    };
    (service as any).requestJson = async () => {
      requestCalls += 1;
      return (service as any).throwHttpError(
        412,
        'SOLARMAN fixture request',
        'web',
        'cloudflare-challenge-secret-must-not-be-returned',
      );
    };

    await assert.rejects(
      () =>
        (service as any).requestWithAuth(
          { usernameOrEmail: 'fixture-user', password: 'fixture-password' },
          { method: 'POST', endpoint: '/maintain-s/operating/station/search' },
          'SOLARMAN fixture request',
          'web',
          {},
        ),
      (error: unknown) => {
        assert.ok(error instanceof BadGatewayException);
        const payload = error.getResponse() as Record<string, unknown>;
        assert.equal(payload.code, 'AUTH_REQUIRED');
        assert.equal(payload.statusCode, 412);
        assert.doesNotMatch(JSON.stringify(payload), /cloudflare-challenge-secret/i);
        return true;
      },
    );

    assert.equal(requestCalls, 1);
    assert.equal(reloginCalls, 0);
  });

  it('does not classify an official OpenAPI HTTP 412 as browser authorization', () => {
    const service = new SolarmanClientService(config());

    assert.throws(
      () =>
        (service as any).throwHttpError(
          412,
          'SOLARMAN official fixture request',
          'official',
          'official provider response',
        ),
      (error: unknown) => {
        assert.ok(error instanceof BadGatewayException);
        const payload = error.getResponse() as Record<string, unknown>;
        assert.equal(payload.statusCode, 412);
        assert.equal(payload.code, undefined);
        return true;
      },
    );
  });

  it('does not start a web password login when no manual session exists', async () => {
    const service = new SolarmanClientService(config());

    await assert.rejects(
      () =>
        service.login(
          { usernameOrEmail: 'fixture-user', password: 'fixture-password' },
          { mode: 'web' },
        ),
      (error: unknown) => {
        assert.ok(error instanceof BadGatewayException);
        assert.equal((error.getResponse() as Record<string, unknown>).code, 'AUTH_REQUIRED');
        return true;
      },
    );
  });

  it('never serializes SOLARMAN token or cookie values to frontend APIs', () => {
    const service = new SolarmanConnectionsService(
      {} as any,
      config(),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const serialized = (service as any).serializeConnection(
      {
        id: 'fixture-connection',
        accountName: 'Fixture connection',
        providerType: 'COOKIE_SESSION',
        usernameOrEmail: 'fixture-user',
        passwordEncrypted: 'encrypted-password',
        accessToken: 'secret-access-token',
        refreshToken: 'secret-refresh-token',
        accessTokenEncrypted: 'secret-encrypted-access-token',
        refreshTokenEncrypted: 'secret-encrypted-refresh-token',
        cookieJar: { persisted: true },
        cookieJarEncrypted: 'secret-cookie-value',
        status: 'AUTH_REQUIRED',
        syncLogs: [],
        systems: [],
        debugSnapshots: [],
      },
      true,
    );

    assert.equal(serialized.accessTokenPreview, undefined);
    assert.equal(serialized.accessToken, undefined);
    assert.equal(serialized.refreshToken, undefined);
    assert.equal(serialized.accessTokenEncrypted, undefined);
    assert.equal(serialized.refreshTokenEncrypted, undefined);
    assert.equal(serialized.cookieJar, undefined);
    assert.equal(serialized.cookieJarEncrypted, undefined);
    assert.equal(serialized.statusSummary.authStatus, 'AUTH_REQUIRED');
  });

  it('drops password material and requires discovery when switching to web OAuth', async () => {
    const existing = {
      id: 'fixture-connection',
      accountName: 'Fixture connection',
      providerType: 'COOKIE_SESSION',
      usernameOrEmail: 'fixture-user',
      passwordEncrypted: 'fixture-legacy-encrypted-password',
      status: 'ACTIVE',
      accessToken: null,
      refreshToken: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastSuccessfulRefreshAt: null,
      lastRefreshErrorCode: null,
      lastRefreshErrorMessage: null,
      reauthorizationRequiredAt: null,
      cookieJar: null,
      cookieJarEncrypted: null,
      syncLogs: [],
      systems: [],
      debugSnapshots: [],
    };
    let updatedData: Record<string, unknown> = {};
    let auditPayload: Record<string, unknown> = {};
    let invalidatedConnectionId = '';
    const prisma = {
      solarmanConnection: {
        findFirst: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updatedData = data;
          return { ...existing, ...data };
        },
      },
    };
    const auditLogs = {
      log: async ({ payload }: { payload: Record<string, unknown> }) => {
        auditPayload = payload;
      },
    };
    const tokenService = {
      invalidate: (connectionId: string) => {
        invalidatedConnectionId = connectionId;
      },
    };
    const service = new SolarmanConnectionsService(
      prisma as any,
      config(),
      auditLogs as any,
      {} as any,
      {} as any,
      tokenService as any,
    );

    await service.update(
      existing.id,
      {
        providerType: 'WEB_OAUTH_REFRESH_TOKEN',
        password: 'fixture-hidden-password-must-not-persist',
        status: 'VERIFIED',
      },
      'fixture-actor',
    );

    assert.equal(updatedData.passwordEncrypted, null);
    assert.equal(updatedData.status, 'CONFIGURED');
    assert.equal(auditPayload.passwordChanged, false);
    assert.doesNotMatch(JSON.stringify(auditPayload), /fixture-hidden-password/);
    assert.equal(invalidatedConnectionId, existing.id);
  });
});
