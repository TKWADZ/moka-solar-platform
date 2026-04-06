'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { listAuditLogsRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { AuditLogRecord } from '@/types';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadLogs() {
    const nextLogs = await listAuditLogsRequest({
      entityType: entityType || undefined,
      action: action || undefined,
      limit: 100,
    });
    setLogs(nextLogs);
  }

  useEffect(() => {
    loadLogs()
      .catch((requestError) =>
        setError(
          requestError instanceof Error ? requestError.message : 'Không thể tải audit log.',
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');

    try {
      await loadLogs();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể tải audit log.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Audit log toàn hệ thống"
        eyebrow="Theo dõi thao tác, before/after change và dấu vết vận hành"
        dark
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Entity type</span>
              <input
                className="portal-field"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
                placeholder="Ví dụ: Invoice, Customer, SupportTicket"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Action</span>
              <input
                className="portal-field"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="Ví dụ: USER_UPDATED, SUPPORT_TICKET_ASSIGNED"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3 xl:justify-end">
            <button type="button" className="btn-primary" onClick={() => void handleRefresh()} disabled={refreshing}>
              {refreshing ? 'Đang tải...' : 'Áp dụng bộ lọc'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Làm mới
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Dòng thời gian hoạt động"
        eyebrow="Who, what, when, before/after"
        dark
      >
        {loading ? (
          <p className="text-sm text-slate-300">Đang tải audit log...</p>
        ) : logs.length ? (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{log.action}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {log.entityType}
                      {log.entityId ? ` · ${log.entityId}` : ''}
                      {log.moduleKey ? ` · ${log.moduleKey}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{log.user?.fullName || log.user?.email || 'Hệ thống'}</p>
                    <p>{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>

                {(log.beforeState || log.afterState) && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {log.beforeState ? (
                      <div className="rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-xs leading-6 text-slate-400">
                        <p className="font-semibold text-slate-200">Trước thay đổi</p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(log.beforeState, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {log.afterState ? (
                      <div className="rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-xs leading-6 text-slate-400">
                        <p className="font-semibold text-slate-200">Sau thay đổi</p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(log.afterState, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                )}

                {log.ipAddress || log.userAgent ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {log.ipAddress || '-'} · {log.userAgent || '-'}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
            Chưa có audit log nào khớp bộ lọc hiện tại.
          </div>
        )}
      </SectionCard>
    </div>
  );
}
