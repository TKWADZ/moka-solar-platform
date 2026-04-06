import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run(store: RequestContextStore, callback: () => void) {
    this.storage.run(store, callback);
  }

  get() {
    return this.storage.getStore() || null;
  }
}
