import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

test('mixed customer/staff invoice route preserves staff permission checks', async () => {
  let serviceCalls = 0;
  const controller = new InvoicesController({
    findOne: async () => {
      serviceCalls += 1;
      return { id: 'invoice-1' };
    },
  } as any);

  assert.throws(
    () =>
      controller.findOne('invoice-1', {
        sub: 'staff-1',
        role: 'STAFF',
        permissions: [],
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(serviceCalls, 0);

  await controller.findOne('invoice-1', {
    sub: 'staff-1',
    role: 'STAFF',
    permissions: ['billing.read'],
  });
  assert.equal(serviceCalls, 1);
});

test('invoice ownership still rejects a different customer', async () => {
  const service = new InvoicesService(
    {
      invoice: {
        findFirst: async () => ({
          id: 'invoice-1',
          customerId: 'customer-owner',
          contract: {
            customerId: 'customer-owner',
            solarSystem: { customerId: 'customer-owner' },
          },
        }),
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.findOne('invoice-1', {
        sub: 'user-other',
        role: 'CUSTOMER',
        customerId: 'customer-other',
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});
