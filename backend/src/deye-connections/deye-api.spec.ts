import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadGatewayException } from '@nestjs/common';
import { DeyeApiService } from './deye-api.service';

test('Deye permanent provider 4xx errors are not retried', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: 'INVALID_REQUEST' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = new DeyeApiService({ get: () => 1000 } as any);
    await assert.rejects(
      () =>
        service.post('https://example.invalid', '/v1/test', {}, {
          retries: 3,
          description: 'Deye fixture request',
        }),
      (error: unknown) => error instanceof BadGatewayException,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
