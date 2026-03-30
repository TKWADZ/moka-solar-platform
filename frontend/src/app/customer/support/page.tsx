'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquareQuote, SendHorizonal } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  createSupportTicketRequest,
  listMySupportTicketsRequest,
  replySupportTicketRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { StatCardItem, SupportTicketRecord } from '@/types';

function senderRoleLabel(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return 'Vận hành';
  }

  if (role === 'CUSTOMER') {
    return 'Khách hàng';
  }

  return 'Hệ thống';
}

export default function CustomerSupportPage() {
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadTickets() {
    const data = await listMySupportTicketsRequest();
    setTickets(data);
    setLoading(false);
  }

  useEffect(() => {
    loadTickets().catch(() => {
      setError('Không thể tải danh sách hỗ trợ.');
      setLoading(false);
    });
  }, []);

  const stats = useMemo<StatCardItem[]>(() => {
    const openCount = tickets.filter((ticket) => ticket.status === 'OPEN').length;
    const inProgressCount = tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length;
    const lastTouch = tickets[0]?.updatedAt;

    return [
      {
        title: 'Yêu cầu đang mở',
        value: String(openCount),
        subtitle: 'Những đầu việc mới cần đội vận hành tiếp nhận',
        delta: inProgressCount ? `${inProgressCount} ticket đang xử lý` : 'Chưa có ticket cần theo dõi',
        trend: openCount ? 'neutral' : 'up',
      },
      {
        title: 'Lần cập nhật gần nhất',
        value: lastTouch ? formatDateTime(lastTouch) : 'Chưa có',
        subtitle: 'Mốc trao đổi mới nhất giữa khách hàng và vận hành',
        delta: tickets.length ? `${tickets.length} ticket trong lịch sử` : 'Danh mục đang trống',
        trend: 'neutral',
      },
    ];
  }, [tickets]);

  async function handleCreateTicket() {
    if (!title.trim() || !description.trim()) {
      setError('Vui lòng nhập tiêu đề và mô tả sự cố.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await createSupportTicketRequest({
        title,
        description,
        priority,
      });
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      await loadTickets();
      setMessage('Đã gửi yêu cầu hỗ trợ thành công.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể gửi yêu cầu hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(ticketId: string) {
    const messageBody = replyDrafts[ticketId]?.trim();

    if (!messageBody) {
      setError('Vui lòng nhập nội dung phản hồi.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await replySupportTicketRequest(ticketId, messageBody);
      setReplyDrafts((current) => ({ ...current, [ticketId]: '' }));
      await loadTickets();
      setMessage('Đã gửi phản hồi thành công.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể gửi phản hồi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Hỗ trợ" eyebrow="Ticket và hội thoại vận hành" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu hỗ trợ...</p>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
        <SectionCard title="Tạo yêu cầu hỗ trợ" eyebrow="Sự cố hiện trường, hóa đơn và vận hành" dark>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Tiêu đề</span>
              <input
                className="portal-field"
                placeholder="Ví dụ: Cần kiểm tra inverter vào buổi trưa"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Mức độ ưu tiên</span>
              <select
                className="portal-field"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="LOW">Thấp</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HIGH">Cao</option>
                <option value="URGENT">Khẩn cấp</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Mô tả chi tiết</span>
              <textarea
                className="portal-field min-h-[190px]"
                placeholder="Mô tả rõ thời điểm phát sinh, khu vực lắp đặt, ảnh hưởng đến vận hành hoặc hóa đơn để đội ngũ xử lý nhanh hơn."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <button className="btn-primary inline-flex items-center gap-2" type="button" onClick={handleCreateTicket} disabled={submitting}>
              <SendHorizonal className="h-4 w-4" />
              {submitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu'}
            </button>

            {message ? (
              <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Lịch sử trao đổi" eyebrow="Theo dõi tiến độ và phản hồi từ vận hành" dark>
          <div className="space-y-4">
            {tickets.length ? (
              tickets.map((ticket) => (
                <div key={ticket.id} className="portal-card-soft p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{ticket.title}</h3>
                      <p className="mt-2 text-sm text-slate-400">
                        Cập nhật {formatDateTime(ticket.updatedAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusPill label={ticket.status} />
                      <StatusPill label={ticket.priority} />
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-300">{ticket.description}</p>

                  <div className="mt-5 space-y-3">
                    {ticket.messages.length ? (
                      ticket.messages.map((item) => (
                        <div key={item.id} className="rounded-[22px] border border-white/8 bg-white/5 p-4">
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
                          <p className="mt-3 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-white/8 bg-white/5 p-4 text-sm text-slate-300">
                        Đội ngũ vận hành đã tiếp nhận ticket. Hội thoại sẽ xuất hiện ở đây khi có phản hồi mới.
                      </div>
                    )}
                  </div>

                  {ticket.status !== 'CLOSED' ? (
                    <div className="mt-5 grid gap-3">
                      <textarea
                        className="portal-field min-h-[120px]"
                        placeholder="Gửi thêm ghi chú cho đội vận hành"
                        value={replyDrafts[ticket.id] || ''}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-ghost inline-flex items-center gap-2"
                        onClick={() => handleReply(ticket.id)}
                        disabled={submitting}
                      >
                        <SendHorizonal className="h-4 w-4" />
                        Gửi phản hồi
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="portal-card-soft p-5">
                <p className="text-base font-semibold text-white">Chưa có ticket hỗ trợ nào</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Khi cần hỗ trợ kỹ thuật, hóa đơn hoặc vận hành hệ thống, bạn có thể tạo yêu cầu mới ngay tại đây.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
