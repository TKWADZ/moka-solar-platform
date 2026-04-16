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
import { useCustomerTheme } from '@/components/customer-theme-provider';
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
import { cn, formatDateTime } from '@/lib/utils';
import { CustomerSystemMonitor, StatCardItem, SupportTicketRecord } from '@/types';

const CATEGORY_OPTIONS = [
  { value: 'GENERAL', label: 'Yeu cau chung' },
  { value: 'SYSTEM', label: 'He thong dien' },
  { value: 'MONITORING', label: 'Giam sat / du lieu' },
  { value: 'BILLING', label: 'Hoa don' },
  { value: 'PAYMENT', label: 'Thanh toan' },
  { value: 'MAINTENANCE', label: 'Bao tri' },
  { value: 'CONTRACT', label: 'Hop dong' },
  { value: 'OTHER', label: 'Khac' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Thap' },
  { value: 'MEDIUM', label: 'Trung binh' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khan cap' },
] as const;

function categoryLabel(value?: string | null) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || 'Yeu cau chung';
}

function senderRoleLabel(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF' || role === 'MANAGER') {
    return 'Doi van hanh';
  }

  if (role === 'CUSTOMER') {
    return 'Khach hang';
  }

  return 'He thong';
}

export default function CustomerSupportPage() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const headingText = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-slate-300' : 'text-slate-600';
  const { lastEvent, refreshTicketUnread } = usePortalLive();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [systems, setSystems] = useState<CustomerSystemMonitor[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
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
      setError('Khong the tai khu vuc ho tro luc nay.');
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
  }, [refreshTicketUnread, selectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets],
  );

  const stats = useMemo<StatCardItem[]>(() => {
    const openCount = tickets.filter((ticket) =>
      ['OPEN', 'IN_PROGRESS'].includes(ticket.status),
    ).length;
    const unreadCount = tickets.filter((ticket) => ticket.unread).length;
    const lastTouch = tickets[0]?.updatedAt;

    return [
      {
        title: 'Ticket dang mo',
        value: String(openCount),
        subtitle: 'Cac yeu cau dang cho xu ly hoac con trao doi them',
        delta: unreadCount
          ? `${unreadCount} ticket co phan hoi moi`
          : 'Khong co phan hoi moi',
        trend: unreadCount ? 'up' : 'neutral',
      },
      {
        title: 'Cap nhat gan nhat',
        value: lastTouch ? formatDateTime(lastTouch) : 'Chua co',
        subtitle: 'Moc trao doi moi nhat giua khach hang va doi van hanh',
        delta: tickets.length ? `${tickets.length} ticket trong lich su` : 'Chua co ticket nao',
        trend: 'neutral',
      },
    ];
  }, [tickets]);

  async function handleCreateTicket() {
    if (!subject.trim() || !message.trim()) {
      setError('Vui long nhap chu de va noi dung ticket.');
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
      setFeedback('Da gui ticket moi thanh cong.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Khong the tao ticket.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply() {
    if (!selectedTicket || !replyMessage.trim()) {
      setError('Vui long nhap noi dung phan hoi.');
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
      setFeedback('Da gui phan hoi cho ticket.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Khong the gui phan hoi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Ho tro van hanh" eyebrow="Ticket va trao doi voi doi ngu Moka Solar">
        <p className={cn('text-sm', bodyText)}>Dang tai du lieu ticket...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <SectionCard
          title="Tao ticket moi"
          eyebrow="Mo ta ro van de de doi van hanh xu ly nhanh hon"
        >
          <div className="grid gap-4">
            <label className={cn('grid gap-2 text-sm', bodyText)}>
              <span>Hang muc</span>
              <select
                className="customer-field"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={cn('grid gap-2 text-sm', bodyText)}>
                <span>Muc uu tien</span>
                <select
                  className="customer-field"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={cn('grid gap-2 text-sm', bodyText)}>
                <span>He thong lien quan</span>
                <select
                  className="customer-field"
                  value={systemId}
                  onChange={(event) => setSystemId(event.target.value)}
                >
                  <option value="">Chon sau</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={cn('grid gap-2 text-sm', bodyText)}>
              <span>Chu de</span>
              <input
                className="customer-field"
                placeholder="Vi du: Can kiem tra san luong bat thuong"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>

            <label className={cn('grid gap-2 text-sm', bodyText)}>
              <span>Noi dung</span>
              <textarea
                className="customer-field min-h-[200px]"
                placeholder="Mo ta ro thoi diem phat sinh, he thong lien quan, anh huong thuc te va ky vong ho tro."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>

            <label className={cn('grid gap-2 text-sm', bodyText)}>
              <span>Attachment</span>
              <input
                type="file"
                multiple
                className="customer-file-input"
                onChange={(event) => setCreateAttachments(Array.from(event.target.files || []))}
              />
              {createAttachments.length ? (
                <p className="text-xs text-slate-500">
                  {createAttachments.length} file da chon: {createAttachments.map((file) => file.name).join(', ')}
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
              {submitting ? 'Dang gui...' : 'Tao ticket'}
            </button>

            {feedback ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {feedback}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Trao doi trong ticket"
          eyebrow="Theo doi trang thai va phan hoi moi nhat"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
            <div className="space-y-3">
              {tickets.length ? (
                tickets.map((ticket) => {
                  const active = ticket.id === selectedTicketId;

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`w-full text-left ${active ? dark ? 'customer-soft-card ring-2 ring-white/10' : 'customer-soft-card ring-2 ring-slate-950/8' : 'customer-soft-card-muted'} p-4 transition`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn('text-sm font-semibold', headingText)}>
                            {ticket.ticketNumber || ticket.title}
                          </p>
                          <p className={cn('mt-1 line-clamp-2 text-sm', bodyText)}>{ticket.title}</p>
                        </div>
                        {ticket.unread ? (
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusPill label={ticket.status} />
                        <StatusPill label={ticket.priority} />
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        {categoryLabel(ticket.category)} · {formatDateTime(ticket.updatedAt)}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className={cn('customer-soft-card p-5 text-sm leading-6', bodyText)}>
                  Ban chua co ticket nao. Khi can ho tro van hanh, hoa don hoac du lieu he thong, hay tao ticket moi o cot ben trai.
                </div>
              )}
            </div>

            {selectedTicket ? (
              <div className="space-y-4">
                <div className="customer-soft-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {selectedTicket.ticketNumber || 'Ticket ho tro'}
                      </p>
                      <h3 className={cn('mt-2 text-xl font-semibold', headingText)}>
                        {selectedTicket.title}
                      </h3>
                      <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                        {selectedTicket.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill label={selectedTicket.status} />
                      <StatusPill label={selectedTicket.priority} />
                    </div>
                  </div>

                  <div className={cn('mt-4 grid gap-3 text-sm md:grid-cols-2', bodyText)}>
                    <div className="customer-soft-card-muted px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Hang muc</p>
                      <p className={cn('mt-2 font-medium', headingText)}>
                        {categoryLabel(selectedTicket.category)}
                      </p>
                    </div>
                    <div className="customer-soft-card-muted px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">He thong</p>
                      <p className={cn('mt-2 font-medium', headingText)}>
                        {selectedTicket.solarSystem?.name || 'Chua gan he thong cu the'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedTicket.messages.map((item) => (
                    <div key={item.id} className="customer-soft-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <MessageSquareQuote className="h-4 w-4 text-slate-500" />
                          <p className={cn('text-sm font-semibold', headingText)}>{item.senderName}</p>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {senderRoleLabel(item.senderRole)}
                        </p>
                      </div>

                      <p className={cn('mt-3 text-sm leading-6', bodyText)}>{item.message}</p>

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
                                  setError('Khong the tai attachment cua ticket luc nay.'),
                                )
                              }
                              className="btn-secondary-light inline-flex items-center gap-2 !min-h-[40px] px-3 py-2 text-xs"
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
                  <div className="customer-soft-card p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold', headingText)}>Gui phan hoi</p>
                        <p className={cn('mt-1 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                          Noi dung moi se duoc gui ngay cho doi van hanh.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary-light inline-flex items-center gap-2 !min-h-[42px] px-3 py-2 text-xs"
                        onClick={() => loadData(selectedTicket.id).catch(() => undefined)}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Lam moi
                      </button>
                    </div>

                    <textarea
                      className="customer-field mt-4 min-h-[140px]"
                      placeholder="Bo sung them chi tiet, hinh anh hoac cap nhat moi lien quan den ticket nay."
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                    />

                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                      <label className={cn('grid gap-2 text-sm', bodyText)}>
                        <span>Attachment</span>
                        <input
                          type="file"
                          multiple
                          className="customer-file-input"
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
                        {submitting ? 'Dang gui...' : 'Gui phan hoi'}
                      </button>
                    </div>

                    {replyAttachments.length ? (
                      <p className="mt-3 text-xs text-slate-500">
                        {replyAttachments.length} file da chon: {replyAttachments.map((file) => file.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-700">
                    Ticket nay da dong. Neu can ho tro tiep, ban co the tao ticket moi de doi van hanh theo doi de hon.
                  </div>
                )}
              </div>
            ) : (
              <div className="customer-soft-card p-6 text-center">
                <LifeBuoy className="mx-auto h-10 w-10 text-slate-500" />
                <p className={cn('mt-4 text-lg font-semibold', headingText)}>Chon mot ticket de xem chi tiet</p>
                <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                  Moi phan hoi, attachment va trang thai xu ly se hien thi tai day.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
