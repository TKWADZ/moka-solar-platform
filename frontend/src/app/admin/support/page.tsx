'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Download,
  Filter,
  LifeBuoy,
  MessageSquareQuote,
  Paperclip,
  RefreshCcw,
  SendHorizonal,
  Shield,
  UserCheck2,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import { usePortalLive } from '@/components/portal-live-provider';
import {
  assignSupportTicketRequest,
  downloadSupportTicketAttachmentRequest,
  listCustomersRequest,
  listSupportTicketsRequest,
  listUsersRequest,
  markSupportTicketReadRequest,
  replySupportTicketRequest,
  updateSupportTicketStatusRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { CustomerRecord, StatCardItem, SupportTicketRecord, UserRecord } from '@/types';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'OPEN', label: 'Mới' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'RESOLVED', label: 'Đã giải quyết' },
  { value: 'CLOSED', label: 'Đã đóng' },
] as const;

const PRIORITY_OPTIONS = [
  { value: '', label: 'Tất cả mức ưu tiên' },
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'Yêu cầu chung',
  SYSTEM: 'Hệ thống điện',
  MONITORING: 'Giám sát / dữ liệu',
  BILLING: 'Hóa đơn',
  PAYMENT: 'Thanh toán',
  MAINTENANCE: 'Bảo trì',
  CONTRACT: 'Hợp đồng',
  OTHER: 'Khác',
};

const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'STAFF']);

function senderRoleLabel(role?: string | null) {
  if (role === 'CUSTOMER') {
    return 'Khách hàng';
  }

  return 'Nội bộ';
}

export default function AdminSupportPage() {
  const { lastEvent, refreshTicketUnread } = usePortalLive();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [replyInternal, setReplyInternal] = useState(false);
  const [nextStatus, setNextStatus] = useState('IN_PROGRESS');
  const [nextAssigneeId, setNextAssigneeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const assignableUsers = useMemo(
    () => users.filter((user) => STAFF_ROLES.has(user.role?.code || '')),
    [users],
  );

  async function loadData(preferredTicketId?: string) {
    const [ticketList, customerList, userList] = await Promise.all([
      listSupportTicketsRequest({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        customerId: customerFilter || undefined,
        assigneeUserId: assigneeFilter || undefined,
      }),
      listCustomersRequest(),
      listUsersRequest(),
    ]);

    setTickets(ticketList);
    setCustomers(customerList);
    setUsers(userList);

    const nextSelectedId =
      preferredTicketId && ticketList.some((ticket) => ticket.id === preferredTicketId)
        ? preferredTicketId
        : ticketList[0]?.id || '';

    setSelectedTicketId(nextSelectedId);
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => {
      setError('Không thể tải danh sách ticket lúc này.');
      setLoading(false);
    });
  }, [statusFilter, priorityFilter, customerFilter, assigneeFilter]);

  useEffect(() => {
    if (!lastEvent || !lastEvent.type?.startsWith('ticket.')) {
      return;
    }

    loadData(selectedTicketId || undefined).catch(() => undefined);
  }, [lastEvent, selectedTicketId]);

  useEffect(() => {
    const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId);
    setNextStatus(selectedTicket?.status || 'IN_PROGRESS');
    setNextAssigneeId(selectedTicket?.assigneeUser?.id || '');

    if (!selectedTicketId) {
      return;
    }

    markSupportTicketReadRequest(selectedTicketId)
      .then(() => refreshTicketUnread())
      .catch(() => undefined);
  }, [selectedTicketId, tickets]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets],
  );

  const stats = useMemo<StatCardItem[]>(() => {
    const openCount = tickets.filter((ticket) => ticket.status === 'OPEN').length;
    const inProgressCount = tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length;
    const urgentCount = tickets.filter((ticket) => ticket.priority === 'URGENT').length;

    return [
      {
        title: 'Ticket mới',
        value: String(openCount),
        subtitle: 'Các yêu cầu vừa tạo và cần tiếp nhận',
        delta: `${urgentCount} ticket khẩn cấp`,
        trend: urgentCount ? 'up' : 'neutral',
      },
      {
        title: 'Đang xử lý',
        value: String(inProgressCount),
        subtitle: 'Ticket đang theo dõi và chờ cập nhật tiếp theo',
        delta: `${tickets.length} ticket trong bộ lọc hiện tại`,
        trend: 'neutral',
      },
    ];
  }, [tickets]);

  async function handleReply() {
    if (!selectedTicket || !replyMessage.trim()) {
      setError('Vui lòng nhập nội dung phản hồi hoặc ghi chú.');
      return;
    }

    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      await replySupportTicketRequest(selectedTicket.id, {
        message: replyMessage.trim(),
        isInternal: replyInternal,
        attachments: replyAttachments,
      });

      setReplyMessage('');
      setReplyAttachments([]);
      setReplyInternal(false);
      await loadData(selectedTicket.id);
      await refreshTicketUnread();
      setFeedback(replyInternal ? 'Đã lưu ghi chú nội bộ.' : 'Đã gửi phản hồi cho khách hàng.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể gửi phản hồi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate() {
    if (!selectedTicket) {
      return;
    }

    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      await updateSupportTicketStatusRequest(selectedTicket.id, nextStatus);
      await loadData(selectedTicket.id);
      setFeedback('Đã cập nhật trạng thái ticket.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật trạng thái.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign() {
    if (!selectedTicket) {
      return;
    }

    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      await assignSupportTicketRequest(selectedTicket.id, nextAssigneeId || null);
      await loadData(selectedTicket.id);
      setFeedback(nextAssigneeId ? 'Đã gán nhân viên xử lý.' : 'Đã bỏ gán nhân viên xử lý.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật người phụ trách.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Support ticket" eyebrow="Ticket, chat nội bộ và phản hồi khách hàng" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu ticket...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <SectionCard title="Bộ lọc ticket" eyebrow="Lọc theo ưu tiên, khách hàng và người phụ trách" dark>
        <div className="grid gap-4 lg:grid-cols-5">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>Trạng thái</span>
            <select className="portal-field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Mức ưu tiên</span>
            <select className="portal-field" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Khách hàng</span>
            <select className="portal-field" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="">Tất cả khách hàng</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName || customer.user.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Người phụ trách</span>
            <select className="portal-field" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              <option value="">Tất cả nhân sự</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => loadData(selectedTicketId || undefined).catch(() => undefined)}
              className="btn-ghost inline-flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Làm mới
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <SectionCard title="Danh sách ticket" eyebrow="Ưu tiên xử lý theo mức độ khẩn cấp và cập nhật gần nhất" dark>
          <div className="space-y-3">
            {tickets.length ? (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={ticket.id === selectedTicketId ? 'portal-card-soft w-full border border-white/12 bg-white/[0.12] p-4 text-left' : 'portal-card-soft w-full p-4 text-left'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {ticket.ticketNumber || ticket.id}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">{ticket.title}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {ticket.customer?.companyName || ticket.customer?.user?.fullName || 'Khách hàng'}
                      </p>
                    </div>
                    {ticket.unreadForStaff ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-300" /> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill label={ticket.status} />
                    <StatusPill label={ticket.priority} />
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    {CATEGORY_LABELS[ticket.category || 'GENERAL']} • {formatDateTime(ticket.updatedAt)}
                  </p>
                </button>
              ))
            ) : (
              <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                Không có ticket nào trong bộ lọc hiện tại.
              </div>
            )}
          </div>
        </SectionCard>

        {selectedTicket ? (
          <div className="space-y-5">
            <SectionCard title={selectedTicket.title} eyebrow={selectedTicket.ticketNumber || 'Ticket support'} dark>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StatusPill label={selectedTicket.status} />
                  <StatusPill label={selectedTicket.priority} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Khách hàng</p>
                    <p className="mt-2 font-semibold text-white">
                      {selectedTicket.customer?.companyName || selectedTicket.customer?.user?.fullName || 'Chưa rõ'}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{selectedTicket.customer?.user?.email || '—'}</p>
                  </div>

                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Hệ thống</p>
                    <p className="mt-2 font-semibold text-white">
                      {selectedTicket.solarSystem?.name || 'Chưa gắn hệ thống'}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {CATEGORY_LABELS[selectedTicket.category || 'GENERAL']}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Người phụ trách</span>
                    <select className="portal-field" value={nextAssigneeId} onChange={(event) => setNextAssigneeId(event.target.value)}>
                      <option value="">Chưa gán</option>
                      {assignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Trạng thái</span>
                    <select className="portal-field" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                      {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap items-end gap-2">
                    <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={handleAssign} disabled={submitting}>
                      <UserCheck2 className="h-4 w-4" />
                      Gán ticket
                    </button>
                    <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={handleStatusUpdate} disabled={submitting}>
                      <ClipboardCheck className="h-4 w-4" />
                      Cập nhật trạng thái
                    </button>
                  </div>
                </div>

                {selectedTicket.assigneeUser ? (
                  <p className="text-sm text-slate-400">
                    Đang phụ trách: <span className="font-semibold text-white">{selectedTicket.assigneeUser.fullName}</span>
                  </p>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="Chat trong ticket" eyebrow="Trao đổi với khách hàng và ghi chú nội bộ" dark>
              <div className="space-y-3">
                {selectedTicket.messages.map((item) => (
                  <div
                    key={item.id}
                    className={item.isInternal ? 'rounded-[22px] border border-amber-300/18 bg-amber-400/10 p-4' : 'rounded-[22px] border border-white/8 bg-white/[0.04] p-4'}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {item.isInternal ? <Shield className="h-4 w-4 text-amber-200" /> : <MessageSquareQuote className="h-4 w-4 text-slate-300" />}
                        <p className="text-sm font-semibold text-white">{item.senderName}</p>
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {item.isInternal ? 'Ghi chú nội bộ' : senderRoleLabel(item.senderRole)}
                      </p>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-300">{item.message}</p>

                    {item.attachments?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() =>
                              downloadSupportTicketAttachmentRequest(
                                selectedTicket.id,
                                attachment.id,
                                attachment.originalName,
                              ).catch(() =>
                                setError('Không thể tải attachment của ticket lúc này.'),
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.12]"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {attachment.originalName}
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <p className="mt-3 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Phản hồi / ghi chú mới</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Có thể gửi phản hồi cho khách hàng hoặc lưu ghi chú nội bộ chỉ nhân sự thấy.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                    onClick={() => loadData(selectedTicket.id).catch(() => undefined)}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Làm mới
                  </button>
                </div>

                <textarea
                  className="portal-field mt-4 min-h-[160px]"
                  placeholder={replyInternal ? 'Ghi chú nội bộ cho staff / manager' : 'Nội dung phản hồi gửi tới khách hàng'}
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                />

                <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="space-y-3">
                    <label className="grid gap-2 text-sm text-slate-300">
                      <span>Attachment</span>
                      <input
                        type="file"
                        multiple
                        className="portal-field file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                        onChange={(event) => setReplyAttachments(Array.from(event.target.files || []))}
                      />
                    </label>

                    <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={replyInternal}
                        onChange={(event) => setReplyInternal(event.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-300 focus:ring-emerald-300"
                      />
                      Gửi dưới dạng ghi chú nội bộ
                    </label>
                  </div>

                  <button type="button" className="btn-primary inline-flex items-center justify-center gap-2" onClick={handleReply} disabled={submitting}>
                    <SendHorizonal className="h-4 w-4" />
                    {submitting ? 'Đang gửi...' : replyInternal ? 'Lưu ghi chú' : 'Gửi phản hồi'}
                  </button>
                </div>

                {replyAttachments.length ? (
                  <p className="mt-3 text-xs text-slate-400">
                    {replyAttachments.length} file đã chọn: {replyAttachments.map((file) => file.name).join(', ')}
                  </p>
                ) : null}

                {feedback ? (
                  <div className="mt-4 rounded-[18px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    {feedback}
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-4 rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>
        ) : (
          <SectionCard title="Support ticket" eyebrow="Chọn ticket để bắt đầu xử lý" dark>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-6 text-center">
              <LifeBuoy className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-4 text-lg font-semibold text-white">Chưa có ticket trong bộ lọc này</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Điều chỉnh bộ lọc ở phía trên hoặc chờ ticket mới từ khách hàng.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
