import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BillingLifecycleService } from './billing-lifecycle.service';

test('SEMS missing history fails instead of replaying realtime data into past dates', async () => {
  let semsSyncCalls = 0;
  const service = new BillingLifecycleService(
    {
      energyRecord: {
        findMany: async () => [],
      },
    } as any,
    {} as any,
    {
      syncFromSems: async () => {
        semsSyncCalls += 1;
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      (service as any).retrySystemHistory(
        {
          id: 'system-1',
          stationId: 'station-1',
          monitoringPlantId: 'plant-1',
          sourceSystem: 'SEMS_PORTAL',
          monitoringProvider: 'SEMS_PORTAL',
          deyeConnectionId: null,
          luxPowerConnection: null,
        },
        3,
        2026,
      ),
    /Khong tu dong backfill SEMS/,
  );
  assert.equal(semsSyncCalls, 0);
});
