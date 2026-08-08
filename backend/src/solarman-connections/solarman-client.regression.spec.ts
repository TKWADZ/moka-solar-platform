import * as assert from 'node:assert/strict';
import { BadGatewayException } from '@nestjs/common';
import { describe, it } from 'node:test';
import { SolarmanClientService } from './solarman-client.service';

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
  });

  it('re-authenticates once after a web auth failure', async () => {
    const service = new SolarmanClientService(config());
    let requestCalls = 0;
    let reloginCalls = 0;
    (service as any).loginForMode = async () => ({
      mode: 'web', token: null, authHeader: null, cookieJar: 'fixture-cookie',
    });
    (service as any).login = async () => {
      reloginCalls += 1;
      return { mode: 'web', token: null, authHeader: null, cookieJar: 'fresh-fixture-cookie' };
    };
    (service as any).requestJson = async () => {
      requestCalls += 1;
      if (requestCalls === 1) {
        throw new BadGatewayException({ statusCode: 401, message: 'expired' });
      }
      return { body: { success: true }, cookieJar: 'fresh-fixture-cookie' };
    };

    const result = await (service as any).requestWithAuth(
      { usernameOrEmail: 'fixture-user', password: 'fixture-password' },
      { method: 'GET', endpoint: '/fixture' },
      'fixture request',
      'web',
      {},
    );

    assert.equal(result.body.success, true);
    assert.equal(requestCalls, 2);
    assert.equal(reloginCalls, 1);
  });
});
