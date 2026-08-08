import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROVIDER_MONTH_REPAIR_CONFIRMATION,
  buildProviderMonthRepairPlan,
  hasConfirmedBareMonthParserSignature,
  summarizeProviderMonthRepairPlan,
} from './provider-month-repair';
import {
  executeProviderMonthRepairPlan,
  parseArgs,
  validateApplyOptions,
} from './repair-provider-months.cli';

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'energy-1',
    solarSystemId: 'system-1',
    stationId: 'station-1234',
    year: 2001,
    month: 11,
    source: 'SOLARMAN_MONTHLY',
    rawPayload: { time: '11', generationValue: 26 },
    updatedByUserId: null,
    createdAt: '2026-08-08T00:00:00.000Z',
    syncTime: '2026-08-08T00:00:00.000Z',
    deletedAt: null,
    solarSystem: {
      createdAt: '2025-01-01T00:00:00.000Z',
      installDate: '2025-01-01T00:00:00.000Z',
      startedAt: '2025-01-01T00:00:00.000Z',
    },
    ...overrides,
  } as any;
}

describe('provider month repair planning', () => {
  it('defaults the CLI to dry-run mode', () => {
    assert.deepEqual(parseArgs([]), { dryRun: true });
  });

  it('does not open a transaction or mutate rows in dry-run mode', async () => {
    let transactionCalled = false;
    const result = await executeProviderMonthRepairPlan(
      {
        $transaction: async () => {
          transactionCalled = true;
        },
      } as any,
      buildProviderMonthRepairPlan([record()], []),
      { dryRun: true },
    );

    assert.equal(result.appliedCount, 0);
    assert.equal(transactionCalled, false);
  });

  it('requires a recognizable PostgreSQL backup before apply mode', () => {
    const directory = mkdtempSync(join(tmpdir(), 'moka-provider-repair-'));
    const validBackup = join(directory, 'valid.dump');
    const invalidBackup = join(directory, 'invalid.dump');
    writeFileSync(validBackup, Buffer.from('PGDMP-test-fixture'));
    writeFileSync(invalidBackup, Buffer.from([0xff, 0xfe, 0x50, 0x00, 0x47, 0x00]));
    const baseOptions = {
      dryRun: false,
      systemId: 'system-1',
      stationId: 'station-1',
      actorUserId: 'super-admin-1',
      confirmation: PROVIDER_MONTH_REPAIR_CONFIRMATION,
    };

    try {
      assert.doesNotThrow(() =>
        validateApplyOptions({ ...baseOptions, backupReference: validBackup }),
      );
      assert.throws(
        () => validateApplyOptions({ ...baseOptions, backupReference: invalidBackup }),
        /not a recognized PostgreSQL dump/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('detects only the confirmed bare-month parser signature', () => {
    assert.equal(hasConfirmedBareMonthParserSignature({ time: '11' }, 11), true);
    assert.equal(hasConfirmedBareMonthParserSignature({ time: '2026-11' }, 11), false);
    assert.equal(hasConfirmedBareMonthParserSignature({ time: '12' }, 11), false);
  });

  it('finds invalid automated records in dry-run planning', () => {
    const plan = buildProviderMonthRepairPlan(
      [
        record(),
        record({
          id: 'energy-december-boundary',
          year: 2000,
          month: 12,
          rawPayload: { time: '12', generationValue: 26 },
        }),
      ],
      [],
    );
    assert.equal(plan.length, 2);
    assert.ok(
      plan.every((item) => item.action === 'SOFT_DELETE_INVALID_PROVIDER_DATA'),
    );
    assert.equal(summarizeProviderMonthRepairPlan(plan).invalidMonthlyEnergyRecordCount, 2);
  });

  it('requires the invalid provider period to predate the system history start', () => {
    const plan = buildProviderMonthRepairPlan(
      [
        record({
          solarSystem: {
            createdAt: '2001-01-01T00:00:00.000Z',
            installDate: '2001-01-01T00:00:00.000Z',
            startedAt: '2001-01-01T00:00:00.000Z',
          },
        }),
      ],
      [],
    );

    assert.equal(plan.length, 0);
  });

  it('uses startedAt when installDate is unavailable', () => {
    const plan = buildProviderMonthRepairPlan(
      [
        record({
          solarSystem: {
            createdAt: '2026-01-01T00:00:00.000Z',
            installDate: null,
            startedAt: '2025-01-01T00:00:00.000Z',
          },
        }),
      ],
      [],
    );

    assert.equal(plan.length, 1);
  });

  it('does not touch unrelated systems or globally select year 2001', () => {
    const plan = buildProviderMonthRepairPlan(
      [
        record(),
        record({ id: 'energy-2', solarSystemId: 'system-2' }),
        record({ id: 'energy-3', rawPayload: { time: '2026-11' } }),
        record({ id: 'energy-4', source: 'CSV_IMPORT' }),
        record({
          id: 'legitimate-2000-record',
          year: 2000,
          month: 12,
          rawPayload: { time: '2000-12' },
        }),
      ],
      [],
      { systemId: 'system-1' },
    );
    assert.deepEqual(plan.map((item) => item.energyRecord.id), ['energy-1']);
  });

  it('preserves manual overrides', () => {
    const plan = buildProviderMonthRepairPlan(
      [record()],
      [
        {
          id: 'billing-1',
          solarSystemId: 'system-1',
          year: 2001,
          month: 11,
          source: 'SOLARMAN_MONTHLY',
          manualOverrideKwh: 123,
          invoiceId: null,
          invoice: null,
        },
      ],
    );
    assert.equal(plan[0].action, 'PRESERVE_MANUAL_DATA');
  });

  it('reports paid invoices for manual financial review without automatic change', () => {
    const plan = buildProviderMonthRepairPlan(
      [record()],
      [
        {
          id: 'billing-1',
          solarSystemId: 'system-1',
          year: 2001,
          month: 11,
          source: 'SOLARMAN_MONTHLY',
          manualOverrideKwh: null,
          invoiceId: 'invoice-1',
          invoice: {
            id: 'invoice-1',
            status: 'PAID',
            referenceCounts: { items: 2, payments: 1, zaloMessageLogs: 1 },
          },
        },
      ],
    );
    assert.equal(plan[0].action, 'NEEDS_MANUAL_FINANCIAL_REVIEW');
    const summary = summarizeProviderMonthRepairPlan(plan);
    assert.deepEqual(summary.invoiceStatusCounts, { PAID: 1 });
    assert.deepEqual(summary.relatedReferenceCounts, {
      monthlyPvBillingPeriods: 1,
      invoices: 1,
      invoiceItems: 2,
      payments: 1,
      zaloMessageLogs: 1,
    });
  });

  it('plans cancellation only for mutable draft invoices', () => {
    const plan = buildProviderMonthRepairPlan(
      [record()],
      [
        {
          id: 'billing-1',
          solarSystemId: 'system-1',
          year: 2001,
          month: 11,
          source: 'SOLARMAN_MONTHLY',
          manualOverrideKwh: null,
          invoiceId: 'invoice-1',
          invoice: { id: 'invoice-1', status: 'DRAFT' },
        },
      ],
    );
    assert.equal(plan[0].action, 'CANCEL_DRAFT_AND_SOFT_DELETE');
  });
});
