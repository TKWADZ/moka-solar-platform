'use client';

import { TicketRow } from '@/types';
import { StatusPill } from './status-pill';

export function TicketList({
  rows,
  dark = false,
}: {
  rows: TicketRow[];
  dark?: boolean;
}) {
  return (
    <div className="space-y-3">
      {rows.map((ticket) => (
        <div key={ticket.id} className={dark ? 'portal-card p-5' : 'surface-card p-5'}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className={dark ? 'text-lg font-semibold text-white' : 'text-lg font-semibold text-slate-950'}>
                {ticket.title}
              </h4>
              <p className={dark ? 'mt-1 text-sm text-slate-400' : 'mt-1 text-sm text-slate-500'}>
                Cập nhật {ticket.updatedAt}
                {ticket.owner ? ` • ${ticket.owner}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label={ticket.status} />
              <StatusPill label={ticket.priority} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
