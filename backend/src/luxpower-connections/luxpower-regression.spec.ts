import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LuxPowerClientService } from './luxpower-client.service';
import {
  parseLuxPowerMonthChart,
  parseLuxPowerRuntime,
} from './luxpower.parser';

describe('LuxPower preserved implementation regression', () => {
  it('keeps realtime values in W and aggregate energy scaled by 0.1', () => {
    const realtime = parseLuxPowerRuntime({
      serialNum: 'fixture-sn',
      solarPv: 4200,
      consumption: 2500,
      gridPower: 300,
      batteryDischarging: 1000,
      soc: 76,
      hasRuntimeData: true,
    });
    const aggregate = parseLuxPowerMonthChart({
      data: [{ day: 1, eInvDay: 1234, eToUserDay: 1000, eConsumptionDay: 1100 }],
    })[0];

    assert.equal(realtime.pvPowerW, 4200);
    assert.equal(realtime.loadPowerW, 2500);
    assert.equal(realtime.batterySocPct, 76);
    assert.equal(aggregate.inverterOutputKwh, 123.4);
    assert.equal(aggregate.toUserKwh, 100);
    assert.equal(aggregate.consumptionKwh, 110);
  });

  it('re-authenticates exactly once when the existing portal session expires', async () => {
    const service = new LuxPowerClientService({ get: () => undefined } as any);
    let sessionCalls = 0;
    let requestCalls = 0;
    const requestedUrls: string[] = [];
    (service as any).getOrCreateSession = async () => {
      sessionCalls += 1;
      return { mode: 'LOGIN', cookieJar: `fixture-${sessionCalls}`, referer: 'https://server.luxpowertek.com/' };
    };
    (service as any).requestText = async (url: string) => {
      requestedUrls.push(url);
      requestCalls += 1;
      if (requestCalls === 1) {
        return { status: 302, text: '', location: '/web/login', cookieJar: '', url };
      }
      if (requestCalls === 2) {
        return {
          status: 200,
          text: JSON.stringify({ rows: [{ id: 'fixture-plant', name: 'Fixture Plant' }] }),
          location: null,
          cookieJar: 'fixture-2',
          url,
        };
      }
      return {
        status: 200,
        text: JSON.stringify({ rows: [{ serialNum: 'fixture-sn', plantId: 'fixture-plant' }] }),
        location: null,
        cookieJar: 'fixture-2',
        url,
      };
    };

    const result = await service.discoverPlants({
      id: 'fixture-connection',
      username: 'fixture-user',
      password: 'fixture-password',
    });

    assert.equal(sessionCalls, 2);
    assert.equal(result.plants.length, 1);
    assert.ok(requestedUrls.some((url) => url.endsWith('/web/config/plant/list/viewer')));
    assert.ok(requestedUrls.some((url) => url.endsWith('/web/config/inverter/list')));
  });
});
