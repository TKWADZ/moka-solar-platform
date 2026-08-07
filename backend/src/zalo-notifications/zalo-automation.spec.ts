import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZaloAutomationService } from './zalo-automation.service';

test('manual Zalo automation remains disabled and dry-run by default', async () => {
  let sendCalls = 0;
  const service = new ZaloAutomationService(
    { get: () => undefined } as any,
    {
      invoice: {
        findMany: async () => [],
      },
    } as any,
    {
      sendInvoiceNotification: async () => {
        sendCalls += 1;
      },
    } as any,
    {
      resolveConfig: async () => ({ dryRun: false }),
    } as any,
  );

  assert.equal(service.getStatus().enabled, false);
  const summary = await service.runNow('actor-1');
  assert.ok('dryRun' in summary);
  if (!('dryRun' in summary)) {
    throw new Error('Expected a completed Zalo automation summary');
  }
  assert.equal(summary.dryRun, true);
  assert.equal(summary.invoice.attempted, 0);
  assert.equal(summary.reminder.attempted, 0);
  assert.equal(summary.paid.attempted, 0);
  assert.equal(sendCalls, 0);
});
