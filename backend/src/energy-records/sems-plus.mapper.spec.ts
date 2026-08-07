import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mapSemsPlusToLegacySnapshot,
  mergeSemsPlusPlantLists,
} from './sems-plus.mapper';

test('SEMS+ plant merge retains base-list plants missing from the enriched overview', () => {
  const merged = mergeSemsPlusPlantLists(
    [
      { id: 'plant-online', name: 'Online plant', status: 'ONLINE' },
      { id: 'plant-offline', name: 'Offline plant', status: 'OFFLINE' },
    ],
    [{ id: 'plant-online', productionToday: 12.5, productionTotal: 1200 }],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.find((plant) => plant.id === 'plant-offline')?.status, 'OFFLINE');
  assert.equal(merged.find((plant) => plant.id === 'plant-online')?.productionToday, 12.5);
});

test('SEMS+ mapper preserves legacy energy fields without mapping unverified pSystem', () => {
  const snapshot = mapSemsPlusToLegacySnapshot({
    plantId: 'plant-online',
    baseApi: 'https://sems-plus.invalid',
    fullPlantList: [{ id: 'plant-online', name: 'Online plant' }],
    stationOverview: [
      {
        id: 'plant-online',
        installedPower: 10,
        productionToday: 12.5,
        productionTotal: 1200,
        pSystem: 4.8,
      },
    ],
    fetchedAt: '2026-08-08T00:00:00.000Z',
  });

  assert.equal(snapshot.provider, 'SEMS_PORTAL');
  assert.equal(snapshot.todayGeneratedKwh, 12.5);
  assert.equal(snapshot.totalGeneratedKwh, 1200);
  assert.equal(snapshot.currentPvKw, null);
  assert.equal(snapshot.todayLoadConsumedKwh, null);
});

test('SEMS+ missing production remains null instead of becoming zero', () => {
  const snapshot = mapSemsPlusToLegacySnapshot({
    plantId: 'plant-offline',
    baseApi: 'https://sems-plus.invalid',
    fullPlantList: [{ id: 'plant-offline', name: 'Offline plant' }],
    stationOverview: [],
  });

  assert.equal(snapshot.todayGeneratedKwh, null);
  assert.equal(snapshot.totalGeneratedKwh, null);
});
