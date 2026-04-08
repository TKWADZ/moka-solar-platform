'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  listLuxPowerConnectionsRequest,
  previewLuxPowerPipelineRequest,
} from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/utils';
import {
  LuxPowerBillingAuditRow,
  LuxPowerConnectionRecord,
  LuxPowerMonthlyBillingPreviewRow,
  LuxPowerPipelinePreviewResponse,
} from '@/types';

function prettyJson(value: unknown) {
  if (!value) {
    return 'Chua co du lieu.';
  }

  return JSON.stringify(value, null, 2);
}

function renderValue(value?: number | string | null, suffix = '') {
  if (value === null || value === undefined || value === '') {
    return 'Chua co';
  }

  if (typeof value === 'number') {
    return formatNumber(value, suffix);
  }

  return `${value}${suffix}`;
}

export default function AdminLuxPowerDebugPage() {
  const [connections, setConnections] = useState<LuxPowerConnectionRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<LuxPowerPipelinePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadConnections(nextSelectedId?: string) {
    const nextConnections = await listLuxPowerConnectionsRequest();
    setConnections(nextConnections);
    const targetId = nextSelectedId || nextConnections[0]?.id || '';
    setSelectedId(targetId);
    return targetId;
  }

  async function loadPreview(connectionId: string, forceRelogin = false) {
    if (!connectionId) {
      setPreview(null);
      return;
    }

    const response = await previewLuxPowerPipelineRequest(connectionId, { forceRelogin });
    setPreview(response);
  }

  useEffect(() => {
    void (async () => {
      try {
        const targetId = await loadConnections();
        await loadPreview(targetId);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Khong the tai LuxPower pipeline preview.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const latestRows = useMemo(
    () => preview?.billingPreview?.rows?.slice(0, 6) || [],
    [preview],
  );

  const auditRows = useMemo(
    () => preview?.billingPreview?.auditRows?.slice(0, 12) || [],
    [preview],
  );

  async function handleRefresh(forceRelogin = false) {
    if (!selectedId) return;

    setRefreshing(true);
    setError('');
    try {
      const targetId = await loadConnections(selectedId);
      await loadPreview(targetId, forceRelogin);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the lam moi pipeline preview.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="LuxPower Debug" eyebrow="Raw -> normalized -> billing preview" dark>
        <p className="text-sm text-slate-300">Dang tai pipeline LuxPower...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="LuxPower Debug"
        eyebrow="Raw response -> normalized daily metrics -> monthly billing preview"
        dark
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="portal-field min-w-[280px]"
              value={selectedId}
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedId(nextId);
                void loadPreview(nextId);
              }}
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.accountName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void handleRefresh(false)}
              disabled={!selectedId || refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Lam moi preview
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void handleRefresh(true)}
              disabled={!selectedId || refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Force relogin
            </button>
          </div>
          <Link href="/admin/luxpower" className="text-sm text-slate-300 transition hover:text-white">
            Quay lai LuxPower
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </SectionCard>

      {preview ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="portal-card p-5">
              <p className="text-sm text-slate-400">Dang nhap</p>
              <div className="mt-3 flex items-center gap-3">
                <StatusPill label={preview.connection.statusSummary?.authReady ? 'SAN SANG' : 'THIEU'} />
                <p className="text-sm text-slate-300">{preview.sessionMode}</p>
              </div>
            </div>
            <div className="portal-card p-5">
              <p className="text-sm text-slate-400">Plant</p>
              <p className="mt-3 text-lg font-semibold text-white">
                {preview.snapshot.plantName || 'Chua co'}
              </p>
              <p className="text-sm text-slate-400">{preview.snapshot.plantId || '-'}</p>
            </div>
            <div className="portal-card p-5">
              <p className="text-sm text-slate-400">Realtime</p>
              <p className="mt-3 text-sm text-slate-200">
                PV {renderValue(preview.snapshot.currentPvKw, ' kW')} · Load{' '}
                {renderValue(preview.snapshot.loadPowerKw, ' kW')}
              </p>
              <p className="text-sm text-slate-400">
                Battery {renderValue(preview.snapshot.batterySocPct, '%')}
              </p>
            </div>
            <div className="portal-card p-5">
              <p className="text-sm text-slate-400">Sync gan nhat</p>
              <p className="mt-3 text-sm text-slate-200">
                {formatDateTime(
                  preview.connection.statusSummary?.lastSuccessfulSyncAt ||
                    preview.snapshot.fetchedAt ||
                    null,
                )}
              </p>
              <p className="text-sm text-slate-400">
                Billing source: {preview.billingPreview.billingSourceLabel || 'Chua chon'}
              </p>
            </div>
          </div>

          <SectionCard
            title="Monthly Billing Preview"
            eyebrow="LuxPower normalized metrics linked voi contract va billing source"
            dark
          >
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Billing source</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {preview.billingPreview.billingSourceLabel || 'Chua chon'}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Ky san sang gan nhat</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {preview.billingPreview.latestReadyMonth || 'Chua co'}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Daily normalized</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {formatNumber(preview.normalized.daily.length)}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Monthly normalized</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {formatNumber(preview.normalized.monthly.length)}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="px-3 py-3">Ky</th>
                    <th className="px-3 py-3">Nguon thang</th>
                    <th className="px-3 py-3">PV</th>
                    <th className="px-3 py-3">Consumption</th>
                    <th className="px-3 py-3">Billing value</th>
                    <th className="px-3 py-3">Hop dong</th>
                    <th className="px-3 py-3">Preview bill</th>
                    <th className="px-3 py-3">Trang thai</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRows.map((row: LuxPowerMonthlyBillingPreviewRow) => (
                    <tr key={row.periodKey} className="border-b border-white/5 align-top">
                      <td className="px-3 py-3 font-medium text-white">{row.periodKey}</td>
                      <td className="px-3 py-3">
                        {row.sourceMode === 'AGGREGATED_DAILY' ? 'Gop tu daily' : 'Monthly endpoint'}
                      </td>
                      <td className="px-3 py-3">{renderValue(row.pvGenerationKwh, ' kWh')}</td>
                      <td className="px-3 py-3">{renderValue(row.loadConsumptionKwh, ' kWh')}</td>
                      <td className="px-3 py-3">
                        {row.billingSourceLabel || 'Chua chon'}:{' '}
                        {renderValue(row.billedPvTotalKwh ?? row.sourceValueKwh, ' kWh')}
                      </td>
                      <td className="px-3 py-3">{row.contractNumber || 'Chua link'}</td>
                      <td className="px-3 py-3">{renderValue(row.totalAmount, ' d')}</td>
                      <td className="px-3 py-3">
                        <StatusPill label={row.ready ? 'READY' : 'WAITING'} />
                        {row.reasons.length ? (
                          <div className="mt-2 space-y-1 text-xs text-amber-200">
                            {row.reasons.map((reason) => (
                              <p key={`${row.periodKey}-${reason}`}>{reason}</p>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Billing Audit"
            eyebrow="month | raw PV total | normalized PV total | billed PV total"
            dark
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="px-3 py-3">Month</th>
                    <th className="px-3 py-3">Raw PV total</th>
                    <th className="px-3 py-3">Normalized PV total</th>
                    <th className="px-3 py-3">Billed PV total</th>
                    <th className="px-3 py-3">Billing source</th>
                    <th className="px-3 py-3">Missing days</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row: LuxPowerBillingAuditRow) => (
                    <tr key={`audit-${row.periodKey}`} className="border-b border-white/5">
                      <td className="px-3 py-3 font-medium text-white">{row.periodKey}</td>
                      <td className="px-3 py-3">{renderValue(row.rawPvTotal, ' kWh')}</td>
                      <td className="px-3 py-3">{renderValue(row.normalizedPvTotal, ' kWh')}</td>
                      <td className="px-3 py-3">{renderValue(row.billedPvTotal, ' kWh')}</td>
                      <td className="px-3 py-3">{row.billingSourceLabel || row.billingSource || 'Chua chon'}</td>
                      <td className="px-3 py-3">
                        {row.missingDays.length
                          ? row.missingDays.join(', ')
                          : `Day du ${row.dayCount}/${row.dayCount}`}
                      </td>
                    </tr>
                  ))}
                  {!auditRows.length ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={6}>
                        Chua co du lieu doi soat billing.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Raw LuxPower Response" eyebrow="Payload goc de kiem tra mapping" dark>
              <pre className="max-h-[640px] overflow-auto rounded-[20px] border border-white/10 bg-slate-950/80 p-4 text-xs text-slate-200">
                {prettyJson(preview.rawPayloads)}
              </pre>
            </SectionCard>
            <SectionCard
              title="Normalized Daily Metrics"
              eyebrow="Du lieu ngay sau khi scale va map vao schema noi bo"
              dark
            >
              <pre className="max-h-[640px] overflow-auto rounded-[20px] border border-white/10 bg-slate-950/80 p-4 text-xs text-slate-200">
                {prettyJson(preview.normalized.daily.slice(0, 31))}
              </pre>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
