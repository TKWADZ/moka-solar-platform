import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, finalize, startWith } from 'rxjs';

type RealtimePayload = {
  type: string;
  data?: Record<string, unknown>;
  timestamp: string;
};

@Injectable()
export class RealtimeEventsService {
  private readonly channels = new Map<string, Set<Subject<MessageEvent>>>();

  connect(userId: string): Observable<MessageEvent> {
    const connection = new Subject<MessageEvent>();
    const channel = this.channels.get(userId) ?? new Set<Subject<MessageEvent>>();
    channel.add(connection);
    this.channels.set(userId, channel);

    return connection.asObservable().pipe(
      startWith({
        type: 'stream.ready',
        data: {
          type: 'stream.ready',
          timestamp: new Date().toISOString(),
        },
      } satisfies MessageEvent),
      finalize(() => {
        const active = this.channels.get(userId);
        if (!active) {
          return;
        }

        active.delete(connection);

        if (!active.size) {
          this.channels.delete(userId);
        }
      }),
    );
  }

  emitToUser(userId: string, type: string, data: Record<string, unknown> = {}) {
    const payload = this.createPayload(type, data);
    const channel = this.channels.get(userId);

    if (!channel?.size) {
      return;
    }

    channel.forEach((connection) => {
      connection.next({
        type,
        data: payload,
      });
    });
  }

  emitToUsers(userIds: string[], type: string, data: Record<string, unknown> = {}) {
    Array.from(new Set(userIds.filter(Boolean))).forEach((userId) =>
      this.emitToUser(userId, type, data),
    );
  }

  private createPayload(type: string, data: Record<string, unknown>): RealtimePayload {
    return {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
