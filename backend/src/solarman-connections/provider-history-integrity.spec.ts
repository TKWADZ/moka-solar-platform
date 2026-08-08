import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessProviderHistoryBillingEligibility,
  isAuthoritativeManualSource,
  isProviderHistoryBillingEnabled,
} from '../common/config/provider-history-billing';
import { SolarmanConnectionsService } from './solarman-connections.service';
import {
  parseDailyGeneration,
  parseMonthlyGeneration,
} from './solarman.parser';

const context = {
  expectedStationId: 'fixture-station',
  expectedYear: 2026,
};

function parse(records: Array<Record<string, unknown>>) {
  return parseMonthlyGeneration(
    {
      statistics: { systemId: context.expectedStationId, year: context.expectedYear },
      records,
    },
    context,
  );
}

describe('SOLARMAN provider monthly-history integrity', () => {
  it('maps bare month 11 to the requested year instead of JavaScript year 2001', () => {
    const result = parse([{ time: '11', generationValue: 26 }]);

    assert.deepEqual(
      result.records.map(({ year, month }) => ({ year, month })),
      [{ year: 2026, month: 11 }],
    );
    assert.equal(result.records.some((record) => record.year === 2001), false);
  });

  it('never treats a bare month as a full date in daily history', () => {
    const result = parseDailyGeneration({
      systemId: context.expectedStationId,
      year: context.expectedYear,
      records: [{ time: '11', generationValue: 26 }],
    });

    assert.equal(result, null);
  });

  it('maps bare month 1 to the requested year', () => {
    const result = parse([{ time: '1', generationValue: 1 }]);
    assert.equal(result.records[0]?.year, 2026);
    assert.equal(result.records[0]?.month, 1);
  });

  it('maps all twelve bare month labels to months 1..12 of requested year', () => {
    const result = parse(
      Array.from({ length: 12 }, (_, index) => ({
        time: String(index + 1),
        generationValue: index + 0.5,
      })),
    );

    assert.deepEqual(
      result.records.map((record) => record.month),
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    assert.ok(result.records.every((record) => record.year === 2026));
    assert.equal(result.dataQualityStatus, 'VERIFIED_HISTORY');
  });

  it('parses YYYY-MM and YYYY/MM periods without implementation-dependent Date parsing', () => {
    const result = parse([
      { period: '2026-02', generationValue: 2 },
      { period: '2026/03', generationValue: 3 },
    ]);
    assert.deepEqual(
      result.records.map(({ year, month }) => ({ year, month })),
      [
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
      ],
    );
  });

  it('parses explicit ISO, Unix seconds and Unix milliseconds', () => {
    const unixSeconds = Math.floor(Date.UTC(2026, 4, 1, 0, 0, 0) / 1000);
    const unixMilliseconds = Date.UTC(2026, 5, 1, 0, 0, 0);
    const result = parse([
      { time: '2026-04-15T08:30:00+07:00', generationValue: 4 },
      { time: unixSeconds, generationValue: 5 },
      { time: String(unixMilliseconds), generationValue: 6 },
    ]);
    assert.deepEqual(result.records.map((record) => record.month), [4, 5, 6]);
  });

  it('keeps the provider-local month for timezone-boundary timestamps', () => {
    const result = parseMonthlyGeneration(
      {
        statistics: { systemId: 'fixture-station', year: 2026 },
        records: [
          { time: '2026-03-31T17:05:00Z', generationValue: 4 },
          { time: '2026-04-01T00:05:00+07:00', generationValue: 5 },
        ],
      },
      { ...context, timezone: 'Asia/Ho_Chi_Minh' },
    );
    assert.deepEqual(result.records.map((record) => record.month), [4, 4]);
  });

  it('rejects a conflicting row year instead of silently repairing it', () => {
    const result = parse([{ year: 2001, month: 11, generationValue: 26 }]);
    assert.equal(result.records.length, 0);
    assert.deepEqual(result.rejectionReasons, [{ reason: 'YEAR_MISMATCH', count: 1 }]);
    assert.equal(result.dataQualityStatus, 'INVALID_HISTORY_PERIOD');
  });

  it('rejects invalid months 0 and 13', () => {
    const result = parse([
      { year: 2026, month: 0, generationValue: 1 },
      { year: 2026, month: 13, generationValue: 1 },
    ]);
    assert.equal(result.records.length, 0);
    assert.deepEqual(result.rejectionReasons, [{ reason: 'INVALID_MONTH', count: 2 }]);
  });

  it('skips missing, negative and non-numeric PV instead of storing zero', () => {
    const result = parse([
      { time: '1' },
      { time: '2', generationValue: -1 },
      { time: '3', generationValue: 'NaN' },
    ]);
    assert.equal(result.records.length, 0);
    assert.deepEqual(result.rejectionReasons, [
      { reason: 'MISSING_PV_VALUE', count: 1 },
      { reason: 'INVALID_PV_VALUE', count: 2 },
    ]);
  });

  it('rejects a station mismatch without exposing payload data in reasons', () => {
    const result = parse([
      { stationId: 'unexpected-station', time: '1', generationValue: 1 },
    ]);
    assert.equal(result.records.length, 0);
    assert.deepEqual(result.rejectionReasons, [{ reason: 'STATION_MISMATCH', count: 1 }]);
    assert.doesNotMatch(JSON.stringify(result.rejectionReasons), /unexpected-station/);
  });

  it('keeps provider-history billing disabled by default', () => {
    assert.equal(isProviderHistoryBillingEnabled('SOLARMAN', {}), false);
    assert.equal(isProviderHistoryBillingEnabled('SEMS_PORTAL', {}), false);

    const assessment = assessProviderHistoryBillingEligibility(
      {
        provider: 'SOLARMAN',
        historyContractVerified: true,
        stationVerified: true,
        periodValid: true,
        expectedYearMatches: true,
        dataQualityStatus: 'VERIFIED_HISTORY',
        pvGenerationKwh: 123.4,
        customerAssigned: true,
        manuallyLocked: false,
      },
      {},
    );
    assert.equal(assessment.eligible, false);
    assert.deepEqual(assessment.reasons, ['FEATURE_DISABLED']);
  });

  it('recognizes all authoritative manual source aliases', () => {
    for (const source of [
      'CSV_IMPORT',
      'MANUAL',
      'MANUAL_ENTRY',
      'ADMIN_SYNC',
      'MANUAL_OVERRIDE',
    ]) {
      assert.equal(isAuthoritativeManualSource(source), true);
    }
    assert.equal(isAuthoritativeManualSource('SOLARMAN_MONTHLY'), false);
  });

  it('does not overwrite an existing CSV import during provider sync', async () => {
    let upsertCalled = false;
    let billingSyncCalled = false;
    const existingManualRecord = {
      id: 'manual-record',
      source: 'CSV_IMPORT',
      pvGenerationKwh: 321,
    };
    const prisma = {
      monthlyEnergyRecord: {
        findUnique: async () => existingManualRecord,
        upsert: async () => {
          upsertCalled = true;
        },
      },
      monthlyPvBilling: {
        findUnique: async () => null,
      },
    };
    const service = new SolarmanConnectionsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {
        sync: async () => {
          billingSyncCalled = true;
        },
      } as any,
      {} as any,
    );

    const result = await (service as any).upsertMonthlyRecord({
      connection: {},
      system: { id: 'system-1', customerId: 'customer-1' },
      station: { stationId: 'fixture-station' },
      monthlyRecord: {
        systemId: 'fixture-station',
        year: 2026,
        month: 1,
        pvGenerationKwh: 999,
        raw: {},
      },
      expectedYear: 2026,
      historyDataQualityStatus: 'VERIFIED_HISTORY',
    });

    assert.equal(result.monthlyEnergyRecord, existingManualRecord);
    assert.equal(result.recordPersisted, false);
    assert.deepEqual(result.billingSkipReasons, ['MANUAL_DATA_LOCKED']);
    assert.equal(upsertCalled, false);
    assert.equal(billingSyncCalled, false);
  });

  it('does not overwrite an existing manual billing override', async () => {
    let upsertCalled = false;
    const prisma = {
      monthlyEnergyRecord: {
        findUnique: async () => null,
        upsert: async () => {
          upsertCalled = true;
        },
      },
      monthlyPvBilling: {
        findUnique: async () => ({
          source: 'SOLARMAN_MONTHLY',
          manualOverrideKwh: 456,
        }),
      },
    };
    const service = new SolarmanConnectionsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await (service as any).upsertMonthlyRecord({
      connection: {},
      system: { id: 'system-1', customerId: 'customer-1' },
      station: { stationId: 'fixture-station' },
      monthlyRecord: {
        systemId: 'fixture-station',
        year: 2026,
        month: 1,
        pvGenerationKwh: 999,
        raw: {},
      },
      expectedYear: 2026,
      historyDataQualityStatus: 'VERIFIED_HISTORY',
    });

    assert.equal(result.recordPersisted, false);
    assert.equal(upsertCalled, false);
  });
});
