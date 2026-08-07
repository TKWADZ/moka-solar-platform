import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

test('mock payment cannot read or mutate production data even when the feature flag is true', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_CUSTOMER_MOCK_PAYMENT;
  let invoiceReads = 0;
  const service = new PaymentsService(
    {
      invoice: {
        findFirst: async () => {
          invoiceReads += 1;
          return null;
        },
      },
    } as any,
    {} as any,
    {} as any,
  );

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_CUSTOMER_MOCK_PAYMENT = 'true';
  try {
    await assert.rejects(
      () => service.createMockPayment('invoice-1'),
      (error: unknown) => error instanceof ServiceUnavailableException,
    );
    assert.equal(invoiceReads, 0);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_CUSTOMER_MOCK_PAYMENT = originalFlag;
  }
});

test('payment proof ownership still rejects a different customer', async () => {
  const service = new PaymentsService(
    {
      payment: {
        findFirst: async () => ({
          id: 'payment-1',
          proofStoragePath: 'storage/payment-proofs/example.pdf',
          invoice: { customerId: 'customer-owner' },
        }),
      },
    } as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.resolveProofFile('payment-1', {
        sub: 'user-other',
        role: 'CUSTOMER',
        customerId: 'customer-other',
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});
