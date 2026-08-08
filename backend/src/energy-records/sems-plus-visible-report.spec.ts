import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertSemsPlusCaptureHasNoAuthArtifacts,
  mapSemsPlusVisibleReport,
  parseSemsPlusApprovedSystemLinks,
  parseSemsPlusLocalizedNumber,
  toSemsPlusOperationalImportRow,
} from './sems-plus-visible-report.mapper';
import { buildOperationalSourceLabel } from '../common/config/operational-data-source';

test('SEMS+ localized values preserve Vietnamese decimals and units', () => {
  assert.equal(parseSemsPlusLocalizedNumber('13.489,70 kWh'), 13489.7);
  assert.equal(parseSemsPlusLocalizedNumber('1,31 kW'), 1.31);
  assert.equal(parseSemsPlusLocalizedNumber('2,75 MWh'), 2750);
  assert.equal(parseSemsPlusLocalizedNumber('--'), null);
});

test('SEMS+ visible report maps PV and grid fields without inventing load consumption', () => {
  const preview = mapSemsPlusVisibleReport({
    plantName: 'Sanitized plant',
    stationId: 'station-sanitized',
    providerStatus: 'Đang chạy',
    period: '08/2026',
    capturedAt: '2026-08-08T00:00:00.000Z',
    generation: { total: '415,10 kWh', daily: ['47,00', '63,00'] },
    gridExport: { total: '2,30 kWh' },
    gridImport: { total: '169,10 kWh' },
    batteryCharge: { total: '69,40 kWh' },
    batteryDischarge: { total: '69,60 kWh' },
  });
  const row = toSemsPlusOperationalImportRow(preview, {
    stationId: 'station-sanitized',
    systemCode: 'SYSTEM-001',
  });

  assert.equal(preview.importEligible, true);
  assert.equal(preview.pvGenerationKwh, 415.1);
  assert.equal(row?.systemCode, 'SYSTEM-001');
  assert.equal(row?.['Năng lượng đã mua -Trong tháng(kWh)'], 169.1);
  assert.equal('Điện tiêu thụ' in (row || {}), false);
});

test('SEMS+ zero-only capture is held for review instead of importing false zero production', () => {
  const preview = mapSemsPlusVisibleReport({
    plantName: 'Offline plant',
    providerStatus: 'Ngoại tuyến',
    period: '08/2026',
    generation: { total: 0, daily: [0, 0, 0] },
  });

  assert.equal(preview.importEligible, false);
  assert.equal(preview.dataQualityStatus, 'REVIEW_REQUIRED');
  assert.ok(preview.warnings.includes('ZERO_ONLY_PROVIDER_DATA'));
  assert.ok(preview.warnings.includes('PROVIDER_OFFLINE'));
  assert.equal(toSemsPlusOperationalImportRow(preview), null);
});

test('SEMS+ capture rejects auth artifacts before conversion', () => {
  assert.throws(
    () => assertSemsPlusCaptureHasNoAuthArtifacts({ access_token: 'do-not-store' }),
    /forbidden auth field/,
  );
});

test('SEMS+ visible report requires an explicitly approved system link', () => {
  const preview = mapSemsPlusVisibleReport({
    plantName: 'Sanitized plant',
    stationId: 'station-sanitized',
    period: '08/2026',
    generation: { total: '100 kWh' },
  });

  assert.equal(toSemsPlusOperationalImportRow(preview), null);
  assert.equal(
    toSemsPlusOperationalImportRow(preview, {
      stationId: 'different-station',
      systemCode: 'SYSTEM-001',
    }),
    null,
  );
});

test('SEMS+ system link parser includes only explicitly approved links', () => {
  const links = parseSemsPlusApprovedSystemLinks({
    schemaVersion: 1,
    links: [
      { stationId: 'station-approved', systemCode: 'SYSTEM-001', approved: true },
      { stationId: 'station-pending', systemCode: 'SYSTEM-002', approved: false },
    ],
  });

  assert.equal(links.get('station-approved')?.systemCode, 'SYSTEM-001');
  assert.equal(links.has('station-pending'), false);
});

test('SEMS+ system link parser rejects ambiguous duplicate stations', () => {
  assert.throws(
    () =>
      parseSemsPlusApprovedSystemLinks({
        schemaVersion: 1,
        links: [
          { stationId: 'duplicate', systemCode: 'SYSTEM-001', approved: true },
          { stationId: 'duplicate', systemCode: 'SYSTEM-002', approved: true },
        ],
      }),
    /duplicate stationId/,
  );
});

test('SEMS+ visible report keeps an explicit audited source label', () => {
  assert.equal(buildOperationalSourceLabel('SEMS_PLUS_VISIBLE_REPORT'), 'Báo cáo SEMS+');
});
