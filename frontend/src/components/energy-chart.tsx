'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '@/lib/i18n';
import { cn, formatNumber } from '@/lib/utils';
import { ChartPoint } from '@/types';

export function EnergyChart({
  data,
  title,
  description,
  unit = 'kWh',
  dark = false,
}: {
  data: ChartPoint[];
  title: string;
  description?: string;
  unit?: 'kWh' | 'kW';
  dark?: boolean;
}) {
  const { tt } = useI18n();

  return (
    <div className={cn(dark ? 'portal-card p-5 sm:p-6' : 'surface-card p-5 sm:p-6')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className={cn(
              'text-[11px] uppercase tracking-[0.22em]',
              dark ? 'text-slate-500' : 'text-slate-400',
            )}
          >
            Theo doi nang luong
          </p>
          <h3
            className={cn(
              'mt-2 text-xl font-semibold tracking-tight sm:text-2xl',
              dark ? 'text-white' : 'text-slate-950',
            )}
          >
            {tt(title)}
          </h3>
        </div>
        <p className={cn('max-w-xl text-sm leading-6', dark ? 'text-slate-400' : 'text-slate-600')}>
          {tt(description || 'Can bang giua phat dien, phu tai va phan dien mua tu luoi.')}
        </p>
      </div>

      <div className="mt-5 h-[250px] sm:mt-6 sm:h-[320px] xl:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="solarArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="loadArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gridArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}
              strokeDasharray="3 7"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              stroke={dark ? '#64748b' : '#94a3b8'}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              stroke={dark ? '#64748b' : '#94a3b8'}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              width={54}
              tickFormatter={(value) => formatNumber(Number(value || 0), unit)}
            />
            <Tooltip
              formatter={(value) => formatNumber(Number(value || 0), unit)}
              contentStyle={{
                borderRadius: 18,
                border: dark
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid rgba(15,23,42,0.08)',
                background: dark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.98)',
                boxShadow: dark
                  ? '0 24px 60px rgba(2,6,23,0.36)'
                  : '0 24px 60px rgba(15,23,42,0.12)',
              }}
              labelStyle={{ color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey="solar"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#solarArea)"
            />
            <Area
              type="monotone"
              dataKey="load"
              stroke="#38bdf8"
              strokeWidth={2}
              fill="url(#loadArea)"
            />
            {data.some((item) => typeof item.grid === 'number') ? (
              <Area
                type="monotone"
                dataKey="grid"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gridArea)"
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
