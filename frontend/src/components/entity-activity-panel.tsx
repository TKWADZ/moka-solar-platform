'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock3, MessageSquareText, RefreshCw, Shield, UserCheck2 } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  createEntityInternalNoteRequest,
  getEntityTimelineRequest,
  listUsersRequest,
  updateEntityAssignmentRequest,
} from '@/lib/api';
import { getSession, hasPermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import {
  ActivityTimelineEntry,
  EntityTimelineResponse,
  SessionPayload,
  UserRecord,
  UserRole,
} from '@/types';

type EntityActivityPanelProps = {
  entityType: string;
  entityId?: string | null;
  moduleKey: string;
  title?: string;
  eyebrow?: string;
  emptyMessage?: string;
};

const assignableRoles = new Set<UserRole>(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']);

function roleLabel(role?: string | null) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super admin';
    case 'ADMIN':
      return 'Admin';
    case 'MANAGER':
      return 'Manager';
    case 'STAFF':
      return 'Nhân viên';
    case 'CUSTOMER':
      return 'Khách hàng';
    default:
      return role || 'Chưa gán';
  }
}

function activityLabel(entry: ActivityTimelineEntry) {
  if (entry.body?.trim()) {
    return entry.body.trim();
  }

  if (entry.action?.trim()) {
    return entry.action.replaceAll('_', ' ').trim();
  }

  return 'Cập nhật hoạt động';
}

function actorLabel(entry: ActivityTimelineEntry) {
  const actor = entry.actor;
  if (!actor) {
    return 'Hệ thống';
  }

  return actor.fullName || actor.email || 'Người dùng nội bộ';
}

export function EntityActivityPanel({
  entityType,
  entityId,
  moduleKey,
  title = 'Activity timeline',
  eyebrow = 'Ghi nhận thay đổi, phân công và ghi chú nội bộ',
  emptyMessage = 'Chưa có hoạt động nào được ghi lại cho bản ghi này.',
}: EntityActivityPanelProps) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [timelineData, setTimelineData] = useState<EntityTimelineResponse | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<UserRecord[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSession(getSession());
  }, []);

  const canReadActivity = hasPermission(session, 'activity.read');
  const canReadNotes = hasPermission(session, 'internal_notes.read');
  const canManageNotes = hasPermission(session, 'internal_notes.manage');
  const canReadAssignment = hasPermission(session, 'assignments.read');
  const canManageAssignment = hasPermission(session, 'assignments.manage');

  async function loadPanel() {
    if (!entityId) {
      setTimelineData(null);
      setAssignableUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextTimeline, nextUsers] = await Promise.all([
        getEntityTimelineRequest(entityType, entityId, 50),
        canManageAssignment ? listUsersRequest() : Promise.resolve([] as UserRecord[]),
      ]);

      setTimelineData(nextTimeline);
      setAssignableUsers(
        nextUsers.filter((user) => assignableRoles.has((user.role?.code || 'CUSTOMER') as UserRole)),
      );
      setAssigneeId(nextTimeline.assignment?.assignedToUser?.id || '');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải activity timeline lúc này.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, entityType, entityId]);

  const visibleTimeline = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    return timelineData.timeline.filter((entry) => {
      if (entry.kind === 'INTERNAL_NOTE') {
        return canReadNotes;
      }

      return canReadActivity;
    });
  }, [canReadActivity, canReadNotes, timelineData]);

  if (!entityId) {
    return null;
  }

  if (!canReadActivity && !canReadNotes && !canReadAssignment) {
    return null;
  }

  const assignment = timelineData?.assignment || null;

  async function handleSaveNote() {
    if (!entityId || !noteBody.trim()) {
      setError('Vui lòng nhập nội dung ghi chú nội bộ.');
      return;
    }

    setSavingNote(true);
    setMessage('');
    setError('');

    try {
      await createEntityInternalNoteRequest(entityType, entityId, {
        body: noteBody.trim(),
        moduleKey,
      });
      setNoteBody('');
      setMessage('Đã lưu ghi chú nội bộ.');
      await loadPanel();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu ghi chú nội bộ.',
      );
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSaveAssignment() {
    if (!entityId) {
      return;
    }

    setSavingAssignment(true);
    setMessage('');
    setError('');

    try {
      await updateEntityAssignmentRequest(entityType, entityId, {
        assignedToUserId: assigneeId || null,
        moduleKey,
      });
      setMessage(assigneeId ? 'Đã cập nhật người phụ trách.' : 'Đã bỏ gán người phụ trách.');
      await loadPanel();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể cập nhật người phụ trách.',
      );
    } finally {
      setSavingAssignment(false);
    }
  }

  return (
    <SectionCard title={title} eyebrow={eyebrow} dark>
      {loading ? (
        <p className="text-sm text-slate-300">Đang tải activity timeline...</p>
      ) : (
        <div className="space-y-5">
          {canReadAssignment ? (
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-100">
                  <UserCheck2 className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Assignment tracking
                  </p>
                  <div className="mt-2 grid gap-1 text-sm leading-6 text-slate-300 md:grid-cols-2">
                    <p>
                      Người phụ trách:{' '}
                      <span className="font-medium text-white">
                        {assignment?.assignedToUser?.fullName || 'Chưa gán'}
                      </span>
                    </p>
                    <p>
                      Gán bởi:{' '}
                      <span className="font-medium text-white">
                        {assignment?.assignedByUser?.fullName || '-'}
                      </span>
                    </p>
                    <p>
                      Thời điểm gán:{' '}
                      <span className="font-medium text-white">
                        {assignment?.assignedAt ? formatDateTime(assignment.assignedAt) : '-'}
                      </span>
                    </p>
                    <p>
                      Xử lý gần nhất:{' '}
                      <span className="font-medium text-white">
                        {assignment?.lastHandledByUser?.fullName || '-'}
                      </span>
                    </p>
                  </div>

                  {canManageAssignment ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="grid min-w-[240px] flex-1 gap-2 text-sm text-slate-300">
                        <span>Đổi người phụ trách</span>
                        <select
                          className="portal-field"
                          value={assigneeId}
                          onChange={(event) => setAssigneeId(event.target.value)}
                        >
                          <option value="">Chưa gán</option>
                          {assignableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName} · {roleLabel(user.role?.code)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={savingAssignment}
                        onClick={() => void handleSaveAssignment()}
                      >
                        {savingAssignment ? 'Đang lưu...' : 'Cập nhật phân công'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {canManageNotes ? (
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-100">
                  <Shield className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Internal note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Ghi chú này chỉ hiển thị cho staff, manager và super admin.
                  </p>
                  <textarea
                    className="portal-field mt-4 min-h-[120px]"
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Ghi nhanh bối cảnh xử lý, rủi ro hoặc việc cần bàn giao."
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={savingNote}
                      onClick={() => void handleSaveNote()}
                    >
                      <MessageSquareText className="h-4 w-4" />
                      {savingNote ? 'Đang lưu...' : 'Lưu ghi chú nội bộ'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setNoteBody('');
                        setMessage('');
                        setError('');
                        void loadPanel();
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Làm mới
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {message ? (
            <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            {visibleTimeline.length ? (
              visibleTimeline.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{activityLabel(entry)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {entry.kind.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{actorLabel(entry)}</p>
                      <p>{formatDateTime(entry.createdAt)}</p>
                    </div>
                  </div>

                  {entry.moduleKey ? (
                    <p className="mt-3 text-sm text-slate-400">Module: {entry.moduleKey}</p>
                  ) : null}

                  {entry.beforeState || entry.afterState ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {entry.beforeState ? (
                        <div className="rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-xs leading-6 text-slate-400">
                          <p className="font-semibold text-slate-200">Trước thay đổi</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(entry.beforeState, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {entry.afterState ? (
                        <div className="rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-xs leading-6 text-slate-400">
                          <p className="font-semibold text-slate-200">Sau thay đổi</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(entry.afterState, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-4.5 w-4.5 text-slate-300" />
                  <p>{emptyMessage}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
