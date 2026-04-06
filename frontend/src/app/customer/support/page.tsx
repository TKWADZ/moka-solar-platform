'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  LifeBuoy,
  MessageSquareQuote,
  Paperclip,
  PlusCircle,
  RefreshCcw,
  SendHorizonal,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import { usePortalLive } from '@/components/portal-live-provider';
import {
  createSupportTicketRequest,
  customerDashboardRequest,
  downloadSupportTicketAttachmentRequest,
  listMySupportTicketsRequest,
  markSupportTicketReadRequest,
  replySupportTicketRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { CustomerSystemMonitor, StatCardItem, SupportTicketRecord } from '@/types';

const CATEGORY_OPTIONS = [
  { value: 'GENERAL', label: 'Yêu cầu chung' },
  { value: 'SYSTEM', label: 'Hệ thống điện' },
  { value: 'MONITORING', label: 'Giám sát / dữ liệu' },
  { value: 'BILLING', label: 'Hóa đơn' },
  { value: 'PAYMENT', label: 'Thanh toán' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
  { value: 'CONTRACT', label: 'Hợp đồng' },
  { value: 'OTHER', label: 'Khác' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
] as const;

function categoryLabel(value?: string | null) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || 'Yêu cầu chung';
}

function senderRoleLabel(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
    return 'Đội vận hành';
  }

  if (role === 'CUSTOMER') {
    return 'Khách hàng';
  }

  return 'Hệ thống';
}

export default function CustomerSupportPage() {
  const { lastEvent, refreshTicketUnread } = usePortalLive();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [systems, setSystems] = useState<CustomerSystemMonitor[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [priority, setPriority] = useState('MEDIUM');
  const [systemId, setSystemId] = useState('');
  const [message, setMessage] = useState('');
  const [createAttachments, setCreateAttachments] = useState<File[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function loadData(preferredTicketId?: string) {
    const [ticketList, dashboard] = await Promise.all([
      listMySupportTicketsRequest(),
      customerDashboardRequest(),
    ]);

    setTickets(ticketList);
    setSystems(dashboard.systems || []);

    const nextSelectedId =
      preferredTicketId && ticketList.some((ticket) => ticket.id === preferredTicketId)
        ? preferredTicketId
        : ticketList[0]?.id || '';

    setSelectedTicketId(nextSelectedId);
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => {
      setError('Không thể tải khu vực hỗ trợ lúc này.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!lastEvent || !lastEvent.type?.startsWith('ticket.')) {
      return;
    }

    loadData(selectedTicketId || undefined).catch(() => undefined);
  }, [lastEvent, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) {
      return;
    }

    markSupportTicketReadRequest(selectedTicketId)
      .then(() => refreshTicketUnread())
      .catch(() => undefined);
  }, [selectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets],
  );

  const stats = useMemo<StatCardItem[]>(() => {
    const openCount = tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).length;
    const unreadCount = tickets.filter((ticket) => ticket.unread).length;
    const lastTouch = tickets[0]?.updatedAt;

    return [
      {
        title: 'Ticket đang mở',
        value: String(openCount),
        subtitle: 'Các yêu cầu đang chờ xử lý hoặc còn trao đổi thêm',
        delta: unreadCount ? `${unreadCount} ticket có phản hồi mới` : 'Không có phản hồi mới',
        trend: unreadCount ? 'up' : 'neutral',
      },
      {
        title: 'Cập nhật gần nhất',
        value: lastTouch ? formatDateTime(lastTouch) : 'Chưa có',
        subtitle: 'Mốc trao đổi mới nhất giữa khách hàng và đội vận hành',
        delta: tickets.length ? `${tickets.length} ticket trong lịch sử` : 'Chưa có ticket nào',
        trend: 'neutral',
      },
    ];
  }, [tickets]);

  async function handleCreateTicket() {
    if (!subject.trim() || !message.trim()) {
      setError('Vui lòng nhập chủ đề và nội dung ticket.');
      return;
    }

    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      const created = await createSupportTicketRequest({
        subject,
        message,
        priority,
        category,
        solarSystemId: systemId || undefined,
        attachments: createAttachments,
      });

      setSubject('');
      setMessage('');
      setCategory('GENERAL');
      setPriority('MEDIUM');
      setSystemId('');
      setCreateAttachments([]);
      await loadData(created.id);
      await refreshTicketUnread();
      setFeedback('Đã gửi ticket mới thành công.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể tạo ticket.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply() {
    if (!selectedTicket || !replyMessage.trim()) {
      setError('Vui lòng nhập nội dung phản hồi.');
      return;
    }

    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      await replySupportTicketRequest(selectedTicket.id, {
        message: replyMessage.trim(),
        attachments: replyAttachments,
      });

      setReplyMessage('');
      setReplyAttachments([]);
      await loadData(selectedTicket.id);
      await refreshTicketUnread();
      setFeedback('Đã gửi phản hồi cho ticket.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể gửi phản hồi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Hỗ trợ vận hành" eyebrow="Ticket và trao đổi với đội ngũ Moka Solar" dark>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <SectionCard title="Tạo ticket mới" eyebrow="Mô tả rõ vấn đề để đội vận hành xử lý nhanh hơn" dark>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Hạng mục</span>
              <select className="portal-field" value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Mức ưu tiên</span>
                <select className="portal-field" value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Hệ thống liên quan</span>
                <select className="portal-field" value={systemId} onChange={(event) => setSystemId(event.target.value)}>
                  <option value="">Chọn sau</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Chủ đề</span>
              <input
                className="portal-field"
                placeholder="Ví dụ: Cần kiểm tra sản lượng bất thường"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Nội dung</span>
              <textarea
                className="portal-field min-h-[200px]"
                placeholder="Mô tả rõ thời điểm phát sinh, hệ thống liên quan, ảnh hưởng thực tế và kỳ vọng hỗ trợ."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Attachment</span>
              <input
                type="file"
                multiple
                className="portal-field file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                onChange={(event) => setCreateAttachments(Array.from(event.target.files || []))}
              />
              {createAttachments.length ? (
                <p className="text-xs text-slate-400">
                  {createAttachments.length} file đã chọn: {createAttachments.map((file) => file.name).join(', ')}
                </p>
              ) : null}
            </label>

            <button
              className="btn-primary inline-flex items-center gap-2"
              type="button"
              onClick={handleCreateTicket}
              disabled={submitting}
            >
              <PlusCircle className="h-4 w-4" />
              {submitting ? 'Đang gửi...' : 'Tạo ticket'}
            </button>

            {feedback ? (
              <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {feedback}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Trao đổi trong ticket" eyebrow="Theo dõi trạng thái và phản hồi mới nhất" dark>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
            <div className="space-y-3">
              {tickets.length ? (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={ticket.id === selectedTicketId ? 'portal-card-soft w-full border border-white/12 bg-white/[0.12] p-4 text-left' : 'portal-card-soft w-full p-4 text-left'}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {ticket.ticketNumber || ticket.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-300">{ticket.title}</p>
                      </div>
                      {ticket.unread ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-300" /> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill label={ticket.status} />
                      <StatusPill label={ticket.priority} />
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      {categoryLabel(ticket.category)} • {formatDateTime(ticket.updatedAt)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                  Bạn chưa có ticket nào. Khi cần hỗ trợ vận hành, hóa đơn hoặc dữ liệu hệ thống, hãy tạo ticket mới ở cột bên trái.
                </div>
              )}
            </div>

            {selectedTicket ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {selectedTicket.ticketNumber || 'Ticket hỗ trợ'}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{selectedTicket.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{selectedTicket.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill label={selectedTicket.status} />
                      <StatusPill label={selectedTicket.priority} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Hạng mục</p>
                      <p className="mt-2 font-medium text-white">{categoryLabel(selectedTicket.category)}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Hệ thống</p>
                      <p className="mt-2 font-medium text-white">
                        {selectedTicket.solarSystem?.name || 'Chưa gắn hệ thống cụ thể'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedTicket.messages.map((item) => (
                    <div key={item.id} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <MessageSquareQuote className="h-4 w-4 text-slate-300" />
                          <p className="text-sm font-semibold text-white">{item.senderName}</p>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {senderRoleLabel(item.senderRole)}
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

                {selectedTicket.status !== 'CLOSED' ? (
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Gửi phản hồi</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Nội dung mới sẽ được gửi ngay cho đội vận hành.
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
                      className="portal-field mt-4 min-h-[140px]"
                      placeholder="Bổ sung thêm chi tiết, hình ảnh hoặc cập nhật mới liên quan đến ticket này."
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                    />

                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                      <label className="grid gap-2 text-sm text-slate-300">
                        <span>Attachment</span>
                        <input
                          type="file"
                          multiple
                          className="portal-field file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                          onChange={(event) => setReplyAttachments(Array.from(event.target.files || []))}
                        />
                      </label>

                      <button
                        type="button"
                        className="btn-primary inline-flex items-center justify-center gap-2"
                        onClick={handleReply}
                        disabled={submitting}
                      >
                        <SendHorizonal className="h-4 w-4" />
                        {submitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                      </button>
                    </div>

                    {replyAttachments.length ? (
                      <p className="mt-3 text-xs text-slate-400">
                        {replyAttachments.length} file đã chọn: {replyAttachments.map((file) => file.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-amber-300/15 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
                    Ticket này đã đóng. Nếu cần hỗ trợ tiếp, bạn có thể tạo ticket mới để đội vận hành theo dõi dễ hơn.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-6 text-center">
                <LifeBuoy className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-lg font-semibold text-white">Chọn một ticket để xem chi tiết</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Mọi phản hồi, attachment và trạng thái xử lý sẽ hiển thị tại đây.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
