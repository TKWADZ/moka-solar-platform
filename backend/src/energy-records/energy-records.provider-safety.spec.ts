import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { EnergyRecordsService } from './energy-records.service';

test('provider snapshots without daily generation never upsert a zero energy record', async () => {
  let upsertCalls = 0;
  let systemUpdateCalls = 0;
  const prisma = {
    solarSystem: {
      findFirst: async () => ({
        id: 'system-1',
        systemCode: 'SYS-001',
        monitoringPlantId: 'plant-1',
        stationId: null,
      }),
      update: async () => {
        systemUpdateCalls += 1;
      },
    },
    energyRecord: {
      upsert: async () => {
        upsertCalls += 1;
      },
    },
  };
  const semsPortalService = {
    fetchMonitorSnapshot: async () => ({
      provider: 'SEMS_PORTAL',
      plantName: 'Plant 1',
      todayGeneratedKwh: null,
      todayLoadConsumedKwh: null,
      todayGridImportedKwh: null,
      todayGridExportedKwh: null,
      fetchedAt: new Date().toISOString(),
    }),
  };
  const service = new EnergyRecordsService(
    prisma as any,
    { log: async () => undefined } as any,
    semsPortalService as any,
    {} as any,
  );

  await assert.rejects(
    () => service.syncFromSems('system-1', { plantId: 'plant-1' }),
    (error: unknown) => error instanceof BadGatewayException,
  );
  assert.equal(upsertCalls, 0);
  assert.equal(systemUpdateCalls, 0);
});

test('mock energy synchronization is blocked before database access in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_ENERGY_MOCK_SYNC;
  let databaseReads = 0;
  const service = new EnergyRecordsService(
    {
      solarSystem: {
        findFirst: async () => {
          databaseReads += 1;
          return null;
        },
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_ENERGY_MOCK_SYNC = 'true';
  try {
    await assert.rejects(
      () => service.mockSync('system-1', 1),
      (error: unknown) => error instanceof ServiceUnavailableException,
    );
    assert.equal(databaseReads, 0);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_ENERGY_MOCK_SYNC = originalFlag;
  }
});
