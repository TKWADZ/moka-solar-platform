'use client';

import { SectionCard } from '@/components/section-card';
import { TicketList } from '@/components/ticket-list';
import { adminTickets } from '@/data/mock';

export default function AdminSupportPage() {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard title="Tổng quan SLA" eyebrow="Sức khỏe hàng chờ vận hành" dark>
        <div className="grid gap-3">
          <div className="portal-card-soft p-4">
            <p className="text-sm text-slate-400">Ticket đang mở</p>
            <p className="mt-2 text-3xl font-semibold text-white">6</p>
          </div>
          <div className="portal-card-soft p-4">
            <p className="text-sm text-slate-400">Phản hồi trung bình</p>
            <p className="mt-2 text-3xl font-semibold text-white">2.4h</p>
          </div>
          <div className="portal-card-soft p-4">
            <p className="text-sm text-slate-400">Lượt điều phối hiện trường hôm nay</p>
            <p className="mt-2 text-3xl font-semibold text-white">3</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Hàng chờ ticket" eyebrow="Sắp xếp theo mức ưu tiên" dark>
        <TicketList rows={adminTickets} dark />
      </SectionCard>
    </div>
  );
}
