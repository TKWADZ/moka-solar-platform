'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getAccessToken } from '@/lib/auth';
import {
  buildApiUrl,
  listMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  notificationsUnreadSummaryRequest,
  supportTicketUnreadSummaryRequest,
} from '@/lib/api';
import {
  NotificationRecord,
  PortalRealtimeEvent,
  SupportTicketUnreadSummary,
} from '@/types';

type PortalLiveContextValue = {
  notifications: NotificationRecord[];
  notificationUnreadCount: number;
  ticketUnreadCount: number;
  lastEvent: PortalRealtimeEvent | null;
  isConnected: boolean;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  refreshTicketUnread: () => Promise<SupportTicketUnreadSummary>;
  refreshNotifications: () => Promise<void>;
};

const PortalLiveContext = createContext<PortalLiveContextValue | null>(null);

function parseSseBlocks(rawChunk: string) {
  return rawChunk
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      let eventType = 'message';
      const dataLines: string[] = [];

      lines.forEach((line) => {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
          return;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      });

      const dataText = dataLines.join('\n');
      try {
        return {
          type: eventType,
          data: dataText ? JSON.parse(dataText) : null,
        };
      } catch {
        return {
          type: eventType,
          data: dataText || null,
        };
      }
    });
}

function normalizeRealtimeEvent(rawEvent: {
  type: string;
  data?: unknown;
}): PortalRealtimeEvent {
  const nestedPayload =
    rawEvent.data &&
    typeof rawEvent.data === 'object' &&
    'type' in rawEvent.data &&
    'timestamp' in rawEvent.data
      ? (rawEvent.data as Partial<PortalRealtimeEvent> & { data?: unknown })
      : null;

  return {
    type:
      typeof nestedPayload?.type === 'string'
        ? nestedPayload.type
        : rawEvent.type,
    data:
      nestedPayload && 'data' in nestedPayload
        ? ((nestedPayload.data as Record<string, unknown> | null) ?? null)
        : ((rawEvent.data as Record<string, unknown> | null) ?? null),
    timestamp:
      typeof nestedPayload?.timestamp === 'string'
        ? nestedPayload.timestamp
        : new Date().toISOString(),
  };
}

export function PortalLiveProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [ticketUnreadCount, setTicketUnreadCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<PortalRealtimeEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);

  async function refreshNotifications() {
    const [items, unreadSummary] = await Promise.all([
      listMyNotificationsRequest(12),
      notificationsUnreadSummaryRequest(),
    ]);

    setNotifications(items);
    setNotificationUnreadCount(unreadSummary.unreadCount || 0);
  }

  async function refreshTicketUnread() {
    const summary = await supportTicketUnreadSummaryRequest();
    setTicketUnreadCount(summary.unreadTickets || 0);
    return summary;
  }

  async function markNotificationRead(id: string) {
    await markNotificationReadRequest(id);
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    setNotificationUnreadCount((current) => Math.max(current - 1, 0));
  }

  async function markAllNotificationsRead() {
    const summary = await markAllNotificationsReadRequest();
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setNotificationUnreadCount(summary.unreadCount || 0);
  }

  useEffect(() => {
    let active = true;
    const decoder = new TextDecoder();
    const abortController = new AbortController();

    async function bootstrap() {
      try {
        await Promise.all([refreshNotifications(), refreshTicketUnread()]);
      } catch {
        // Keep the shell usable even if inbox APIs fail temporarily.
      }
    }

    function scheduleReconnect() {
      if (!active) {
        return;
      }

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        void connect();
      }, 2500);
    }

    function handleIncoming(event: PortalRealtimeEvent) {
      setLastEvent(event);

      if (event.type === 'notification.created' && event.data?.notification) {
        const nextNotification = event.data.notification as NotificationRecord;
        setNotifications((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== nextNotification.id);
          return [nextNotification, ...withoutDuplicate].slice(0, 12);
        });
      }

      if (event.type === 'notification.unread-summary' && typeof event.data?.unreadCount === 'number') {
        setNotificationUnreadCount(event.data.unreadCount);
      }

      if (event.type.startsWith('ticket.')) {
        void refreshTicketUnread().catch(() => undefined);
      }
    }

    async function connect() {
      const token = getAccessToken();

      if (!token) {
        setIsConnected(false);
        return;
      }

      try {
        const response = await fetch(buildApiUrl('/notifications/stream'), {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          setIsConnected(false);
          scheduleReconnect();
          return;
        }

        setIsConnected(true);
        const reader = response.body.getReader();
        let buffer = '';

        while (active) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          parts.forEach((part) => {
            const events = parseSseBlocks(`${part}\n\n`);
            events.forEach((event) => {
              handleIncoming(normalizeRealtimeEvent(event));
            });
          });
        }

        setIsConnected(false);
        scheduleReconnect();
      } catch {
        if (!active) {
          return;
        }

        setIsConnected(false);
        scheduleReconnect();
      }
    }

    void bootstrap();
    void connect();

    return () => {
      active = false;
      abortController.abort();
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const value = useMemo<PortalLiveContextValue>(
    () => ({
      notifications,
      notificationUnreadCount,
      ticketUnreadCount,
      lastEvent,
      isConnected,
      markNotificationRead,
      markAllNotificationsRead,
      refreshTicketUnread,
      refreshNotifications,
    }),
    [notifications, notificationUnreadCount, ticketUnreadCount, lastEvent, isConnected],
  );

  return <PortalLiveContext.Provider value={value}>{children}</PortalLiveContext.Provider>;
}

export function usePortalLive() {
  const context = useContext(PortalLiveContext);

  if (!context) {
    throw new Error('usePortalLive must be used within PortalLiveProvider');
  }

  return context;
}
