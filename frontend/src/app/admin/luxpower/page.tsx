'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bug, Link2, Loader2, Plus, RefreshCw, Save, Trash2, Zap } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  createLuxPowerConnectionRequest,
  deleteLuxPowerConnectionRequest,
  getLuxPowerConnectionRequest,
  listAdminSystemsRequest,
  listContractsRequest,
  listCustomersRequest,
  listLuxPowerConnectionsRequest,
  listLuxPowerSyncLogsRequest,
  syncLuxPowerConnectionRequest,
  testLuxPowerConnectionRequest,
  updateLuxPowerConnectionRequest,
} from '@/lib/api';
import { getSession, hasPermission } from '@/lib/auth';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  AdminSystemRecord,
  ContractRecord,
  CustomerRecord,
  LuxPowerConnectionRecord,
  LuxPowerDebugSnapshotRecord,
  LuxPowerNormalizedMetricRecord,
  LuxPowerSyncLogRecord,
  LuxPowerTestResponse,
  SessionPayload,
} from '@/types';

type FormState = {
  accountName: string;
  username: string;
  password: string;
  plantId: string;
  inverterSerial: string;
  customerId: string;
  solarSystemId: string;
  contractId: string;
  billingRuleLabel: string;
  pollingIntervalMinutes: string;
  useDemoMode: boolean;
  status: string;
  notes: string;
};

type ViewMode = 'overview' | 'debug';

const billingSourceOptions = [
  { value: 'E_INV_DAY', label: 'Sản lượng inverter' },
  { value: 'E_TO_USER_DAY', label: 'Điện cấp cho tải' },
  { value: 'E_CONSUMPTION_DAY', label: 'Tổng điện tiêu thụ' },
];

const statusOptions = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'PENDING', label: 'Chờ cấu hình' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'ERROR', label: 'Đang lỗi' },
];

function emptyForm(): FormState {
  return {
    accountName: '',
    username: '',
    password: '',
    plantId: '',
    inverterSerial: '',
    customerId: '',
    solarSystemId: '',
    contractId: '',
    billingRuleLabel: 'E_INV_DAY',
    pollingIntervalMinutes: '60',
    useDemoMode: false,
    status: 'ACTIVE',
    notes: '',
  };
}

function buildForm(connection: LuxPowerConnectionRecord | null): FormState {
  if (!connection) {
    return emptyForm();
  }

  return {
    accountName: connection.accountName || '',
    username: connection.username || '',
    password: '',
    plantId: connection.plantId || '',
    inverterSerial: connection.inverterSerial || '',
    customerId: connection.customerId || '',
    solarSystemId: connection.solarSystemId || '',
    contractId: connection.contractId || '',
    billingRuleLabel: connection.billingRuleLabel || 'E_INV_DAY',
    pollingIntervalMinutes: String(connection.pollingIntervalMinutes || 60),
    useDemoMode: Boolean(connection.useDemoMode),
    status: connection.status || 'ACTIVE',
    notes: connection.notes || '',
  };
}

function renderMetricValue(value?: number | null, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Chưa có';
  }

  return formatNumber(value, suffix);
}

function renderJsonBlock(payload: unknown) {
  if (!payload) {
    return 'Chưa có dữ liệu.';
  }

  return JSON.stringify(payload, null, 2);
}

function getSystemCustomerId(system: AdminSystemRecord) {
  return system.customer?.id || '';
}

function getContractCustomerId(contract: ContractRecord) {
  return contract.customer?.id || '';
}

function getContractSystemId(contract: ContractRecord) {
  return contract.solarSystem?.id || '';
}

function getLatestMetric(
  metrics: LuxPowerNormalizedMetricRecord[] | undefined,
  granularity: LuxPowerNormalizedMetricRecord['granularity'],
) {
  const now = new Date();
  const currentPeriod = now.getFullYear() * 100 + (now.getMonth() + 1);

  return (metrics || [])
    .filter((metric) => {
      if (metric.granularity !== granularity) {
        return false;
      }

      if (granularity !== 'MONTHLY') {
        return true;
      }

      if (!metric.year || !metric.month) {
        return false;
      }

      return metric.year * 100 + metric.month <= currentPeriod;
    })
    .sort((left, right) => right.periodKey.localeCompare(left.periodKey))[0];
}

export default function AdminLuxPowerPage() {
  const [connections, setConnections] = useState<LuxPowerConnectionRecord[]>([]);
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [logs, setLogs] = useState<LuxPowerSyncLogRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<LuxPowerTestResponse | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const canManageConfig = hasPermission(session, 'integration.secrets.manage');
  const canExecute = canManageConfig || hasPermission(session, 'integrations.execute');
  const canViewDebug = session?.user.role === 'SUPER_ADMIN';

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedId) || null,
    [connections, selectedId],
  );

  const filteredSystems = useMemo(
    () => systems.filter((item) => !form.customerId || getSystemCustomerId(item) === form.customerId),
    [systems, form.customerId],
  );

  const filteredContracts = useMemo(
    () =>
      contracts.filter((item) => {
        const matchesCustomer =
          !form.customerId || getContractCustomerId(item) === form.customerId;
        const matchesSystem =
          !form.solarSystemId || getContractSystemId(item) === form.solarSystemId;
        return matchesCustomer && matchesSystem;
      }),
    [contracts, form.customerId, form.solarSystemId],
  );

  const latestRealtimeMetric = useMemo(
    () => getLatestMetric(selectedConnection?.normalizedMetrics, 'REALTIME'),
    [selectedConnection],
  );
  const latestMonthlyMetric = useMemo(
    () => getLatestMetric(selectedConnection?.normalizedMetrics, 'MONTHLY'),
    [selectedConnection],
  );

  async function loadAll(nextSelectedId?: string) {
    const [nextConnections, nextSystems, nextCustomers, nextContracts] = await Promise.all([
      listLuxPowerConnectionsRequest(),
      listAdminSystemsRequest(),
      listCustomersRequest(),
      listContractsRequest(),
    ]);

    setConnections(nextConnections);
    setSystems(nextSystems);
    setCustomers(nextCustomers);
    setContracts(nextContracts);

    const targetId = nextSelectedId || nextConnections[0]?.id || '';
    setSelectedId(targetId);

    if (!targetId) {
      setMode('create');
      setForm(emptyForm());
      setLogs([]);
      return;
    }

    const [detail, nextLogs] = await Promise.all([
      getLuxPowerConnectionRequest(targetId),
      listLuxPowerSyncLogsRequest(targetId),
    ]);

    setMode('edit');
    setForm(buildForm(detail));
    setLogs(nextLogs);
  }

  useEffect(() => {
    loadAll()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải cấu hình LuxPower.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveConnection() {
    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      accountName: form.accountName.trim(),
      username: form.useDemoMode ? undefined : form.username.trim() || undefined,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      plantId: form.plantId.trim() || undefined,
      inverterSerial: form.inverterSerial.trim() || undefined,
      customerId: form.customerId || undefined,
      solarSystemId: form.solarSystemId || undefined,
      contractId: form.contractId || undefined,
      billingRuleLabel: form.billingRuleLabel || undefined,
      pollingIntervalMinutes: Number(form.pollingIntervalMinutes || 60),
      useDemoMode: form.useDemoMode,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (mode === 'create') {
        const created = await createLuxPowerConnectionRequest(payload);
        await loadAll(created.id);
        setMessage('Đã tạo kết nối LuxPower.');
      } else if (selectedConnection) {
        const updated = await updateLuxPowerConnectionRequest(selectedConnection.id, payload);
        await loadAll(updated.id);
        setMessage('Đã cập nhật kết nối LuxPower.');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu kết nối LuxPower.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveConnection();
  }

  async function handleTest() {
    if (!selectedConnection) return;
    setTesting(true);
    setMessage('');
    setError('');
    try {
      const result = await testLuxPowerConnectionRequest(selectedConnection.id);
      setTestResult(result);
      await loadAll(selectedConnection.id);
      setMessage('Đã test LuxPower và lưu snapshot an toàn.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Test LuxPower thất bại.');
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    if (!selectedConnection) return;
    setSyncing(true);
    setMessage('');
    setError('');
    try {
      const result = await syncLuxPowerConnectionRequest(selectedConnection.id);
      await loadAll(selectedConnection.id);
      setMessage(
        result.billingSynced
          ? `Đã sync LuxPower: ${result.monthlySynced || 0} tháng normalized, ${result.billingSynced} billing record.`
          : 'Đã sync LuxPower nhưng chưa đủ điều kiện bật monthly billing.',
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sync LuxPower thất bại.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!selectedConnection || !window.confirm(`Lưu trữ kết nối "${selectedConnection.accountName}"?`)) {
      return;
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteLuxPowerConnectionRequest(selectedConnection.id);
      await loadAll();
      setTestResult(null);
      setMessage('Đã lưu trữ kết nối LuxPower.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu trữ kết nối.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="LuxPower Cloud" eyebrow="Monitor -> normalize -> billing" dark>
        <p className="text-sm text-slate-300">Đang tải cấu hình LuxPower...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Kết nối LuxPower', value: connections.length },
          {
            label: 'Đăng nhập',
            value: connections.filter((item) => item.statusSummary?.authReady).length,
          },
          {
            label: 'Liên kết hệ thống',
            value: connections.filter((item) => item.statusSummary?.plantLinked).length,
          },
          {
            label: 'Sẵn sàng tính bill',
            value: connections.filter((item) => item.statusSummary?.billingReady).length,
          },
        ].map((card) => (
          <div key={card.label} className="portal-card min-w-0 p-5">
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard
          title="Kết nối LuxPower"
          eyebrow="Chọn tài khoản cloud cần liên kết với hệ thống Moka"
          dark
        >
          <div className="mb-4 flex gap-3">
            {canManageConfig ? (
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setSelectedId('');
                  setForm(emptyForm());
                  setLogs([]);
                  setTestResult(null);
                  setViewMode('overview');
                }}
                className="btn-primary"
              >
                <Plus className="h-4 w-4" />
                Tạo kết nối
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadAll(selectedId)}
              className="btn-ghost"
            >
              <RefreshCw className="h-4 w-4" />
              Tải lại
            </button>
          </div>

          <div className="grid gap-3">
            {connections.map((connection) => (
              <button
                key={connection.id}
                type="button"
                onClick={() => {
                  setMode('edit');
                  setSelectedId(connection.id);
                  setForm(buildForm(connection));
                  setViewMode('overview');
                  void loadAll(connection.id);
                }}
                className={cn(
                  'rounded-[22px] border px-4 py-4 text-left transition',
                  selectedId === connection.id
                    ? 'border-white/15 bg-white text-slate-950'
                    : 'border-white/8 bg-white/[0.04] text-white hover:bg-white/[0.07]',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{connection.accountName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {connection.useDemoMode
                        ? 'Demo mode'
                        : connection.username || 'Chưa có username'}
                    </p>
                  </div>
                  <StatusPill label={connection.status} />
                </div>

                <div
                  className={cn(
                    'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                    selectedId === connection.id ? 'text-slate-700' : 'text-slate-300',
                  )}
                >
                  <p>Hệ thống: {connection.solarSystem?.name || 'Chưa gắn'}</p>
                  <p>Hợp đồng: {connection.contract?.contractNumber || 'Chưa gắn'}</p>
                  <p>Plant: {connection.plantId || '-'}</p>
                  <p>Nguồn bill: {connection.statusSummary?.billingSourceLabel || 'Chưa chọn'}</p>
                </div>
              </button>
            ))}

            {!connections.length ? (
              <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                Chưa có kết nối LuxPower nào.
              </div>
            ) : null}
          </div>
        </SectionCard>

        <div className="space-y-5">
          {selectedConnection ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('overview')}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition',
                    viewMode === 'overview'
                      ? 'bg-white text-slate-950'
                      : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
                  )}
                >
                  Vận hành
                </button>
                {canViewDebug ? (
                  <button
                    type="button"
                    onClick={() => setViewMode('debug')}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition',
                      viewMode === 'debug'
                        ? 'bg-white text-slate-950'
                        : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
                    )}
                  >
                    Debug
                  </button>
                ) : null}
                {canViewDebug && selectedConnection ? (
                  <Link
                    href={`/admin/luxpower/debug?connectionId=${selectedConnection.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    Test pipeline
                  </Link>
                ) : null}
              </div>
              {session?.user.role === 'MANAGER' || session?.user.role === 'STAFF' ? (
                <p className="text-sm text-slate-400">
                  Giao diện đang ẩn phần debug kỹ thuật và secret theo quyền hiện tại.
                </p>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="1. Kết nối LuxPower" eyebrow="Lưu tài khoản cloud và kiểm tra đăng nhập trước khi chọn plant" dark>
            <form onSubmit={handleSubmit} className="grid gap-4">
              {!canManageConfig ? (
                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                  Bạn có thể kiểm tra kết nối và đồng bộ dữ liệu, nhưng chỉ Super Admin/Admin mới chỉnh credential và mapping LuxPower.
                </div>
              ) : null}
              <fieldset disabled={!canManageConfig} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  className="portal-field"
                  value={form.accountName}
                  onChange={(event) => updateField('accountName', event.target.value)}
                  placeholder="Tên kết nối"
                />
                <select
                  className="portal-field"
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  className="portal-field"
                  value={form.username}
                  onChange={(event) => updateField('username', event.target.value)}
                  placeholder="LuxPower username"
                  disabled={form.useDemoMode}
                />
                <input
                  className="portal-field"
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder={
                    mode === 'edit'
                      ? 'Để trống nếu giữ nguyên password'
                      : 'LuxPower password'
                  }
                  disabled={form.useDemoMode}
                />

                <input
                  className="portal-field"
                  type="number"
                  min="5"
                  max="1440"
                  value={form.pollingIntervalMinutes}
                  onChange={(event) =>
                    updateField('pollingIntervalMinutes', event.target.value)
                  }
                  placeholder="Polling interval (phút)"
                />
                <input
                  className="portal-field"
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  placeholder="Ghi chú vận hành"
                />
              </div>

              <label className="inline-flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-white"
                  checked={form.useDemoMode}
                  onChange={(event) => updateField('useDemoMode', event.target.checked)}
                />
                Dùng demo mode để kiểm tra login, mapping và normalized metrics an toàn.
              </label>

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

              </fieldset>

              <div className="flex flex-wrap gap-3">
                {canManageConfig ? (
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu kết nối
                </button>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handleTest()}
                  disabled={!selectedConnection || testing || !canExecute}
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                  Test kết nối
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handleSync()}
                  disabled={!selectedConnection || syncing || !canExecute}
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Đồng bộ ngay
                </button>
                {selectedConnection && canManageConfig ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void handleDelete()}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Lưu trữ
                  </button>
                ) : null}
              </div>
            </form>
          </SectionCard>

          {selectedConnection ? (
            <>
              <SectionCard title="Tổng quan LuxPower" eyebrow="Trạng thái monitor, plant và billing theo ngôn ngữ vận hành" dark>
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    {
                      label: 'Đăng nhập',
                      ready: selectedConnection.statusSummary?.authReady,
                      note: selectedConnection.authReadyAt
                        ? formatDateTime(selectedConnection.authReadyAt)
                        : 'Chưa có session hợp lệ',
                    },
                    {
                      label: 'Dữ liệu',
                      ready: selectedConnection.statusSummary?.metricsAvailable,
                      note: `${selectedConnection.normalizedMetrics?.length || 0} điểm normalized`,
                    },
                    {
                      label: 'Liên kết hệ thống',
                      ready: selectedConnection.statusSummary?.plantLinked,
                      note:
                        selectedConnection.solarSystem?.name ||
                        'Chưa link với customer và system',
                    },
                    {
                      label: 'Sẵn sàng tính bill',
                      ready: selectedConnection.statusSummary?.billingReady,
                      note:
                        selectedConnection.statusSummary?.billingSourceLabel ||
                        'Chưa chọn billing source',
                    },
                  ].map((stage) => (
                    <div
                      key={stage.label}
                      className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{stage.label}</p>
                        <StatusPill label={stage.ready ? 'SUCCESS' : 'PENDING'} />
                      </div>
                      <p className="mt-3 text-xs leading-6 text-slate-400">{stage.note}</p>
                    </div>
                  ))}
                </div>

                {selectedConnection.statusSummary?.missingData?.length ? (
                  <div className="mt-4 rounded-[18px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    {selectedConnection.statusSummary.missingData.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
              </SectionCard>

              <div className="grid gap-5 xl:grid-cols-2">
                <SectionCard
                  title="2. Chọn plant"
                  eyebrow="Plant đang dùng để lấy monitor và realtime summary"
                  dark
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Plant ID
                      </span>
                      <input
                        className="portal-field"
                        value={form.plantId}
                        onChange={(event) => updateField('plantId', event.target.value)}
                        placeholder="Nhập plant ID LuxPower"
                        disabled={!canManageConfig}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Inverter serial
                      </span>
                      <input
                        className="portal-field"
                        value={form.inverterSerial}
                        onChange={(event) => updateField('inverterSerial', event.target.value)}
                        placeholder="Nhập inverter serial"
                        disabled={!canManageConfig}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Plant name</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {(selectedConnection.lastProviderResponse?.snapshot as any)?.plantName || 'Chưa có'}
                      </p>
                    </div>
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Plant ID</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {selectedConnection.plantId || (selectedConnection.lastProviderResponse?.snapshot as any)?.plantId || 'Chưa chọn'}
                      </p>
                    </div>
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inverter serial</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {selectedConnection.inverterSerial || (selectedConnection.lastProviderResponse?.snapshot as any)?.serialNumber || 'Chưa chọn'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">PV</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {renderMetricValue(
                          latestRealtimeMetric?.pvPowerW ??
                            (selectedConnection.lastProviderResponse?.snapshot as any)?.pvPowerW,
                          ' W',
                        )}
                      </p>
                    </div>
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Load</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {renderMetricValue(
                          latestRealtimeMetric?.loadPowerW ??
                            (selectedConnection.lastProviderResponse?.snapshot as any)?.loadPowerW,
                          ' W',
                        )}
                      </p>
                    </div>
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Grid</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {renderMetricValue(
                          latestRealtimeMetric?.gridPowerW ??
                            (selectedConnection.lastProviderResponse?.snapshot as any)?.gridPowerW,
                          ' W',
                        )}
                      </p>
                    </div>
                    <div className="portal-card-soft p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Battery SOC</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {renderMetricValue(
                          latestRealtimeMetric?.batterySocPercent ??
                            (selectedConnection.lastProviderResponse?.snapshot as any)?.batterySocPct,
                          '%',
                        )}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="3. Liên kết hệ thống"
                  eyebrow="Hợp đồng và billing source đang dùng để tính hóa đơn tháng"
                  dark
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Khách hàng
                      </span>
                      <select
                        className="portal-field"
                        value={form.customerId}
                        onChange={(event) => updateField('customerId', event.target.value)}
                        disabled={!canManageConfig}
                      >
                        <option value="">Chọn khách hàng</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.companyName || customer.user.fullName} - {customer.customerCode}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Hệ thống / site
                      </span>
                      <select
                        className="portal-field"
                        value={form.solarSystemId}
                        onChange={(event) => updateField('solarSystemId', event.target.value)}
                        disabled={!canManageConfig}
                      >
                        <option value="">Chọn system/site</option>
                        {filteredSystems.map((system) => (
                          <option key={system.id} value={system.id}>
                            {system.name} - {system.systemCode}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Hợp đồng
                      </span>
                      <select
                        className="portal-field"
                        value={form.contractId}
                        onChange={(event) => updateField('contractId', event.target.value)}
                        disabled={!canManageConfig}
                      >
                        <option value="">Chọn hợp đồng</option>
                        {filteredContracts.map((contract) => (
                          <option key={contract.id} value={contract.id}>
                            {contract.contractNumber}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Nguồn dữ liệu tính bill
                      </span>
                      <select
                        className="portal-field"
                        value={form.billingRuleLabel}
                        onChange={(event) => updateField('billingRuleLabel', event.target.value)}
                        disabled={!canManageConfig}
                      >
                        {billingSourceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 text-sm text-slate-300">
                    <p>Khách hàng: {selectedConnection.customer?.companyName || selectedConnection.customer?.user?.fullName || 'Chưa link'}</p>
                    <p>Hệ thống / site: {selectedConnection.solarSystem?.name || 'Chưa link'}</p>
                    <p>Hợp đồng: {selectedConnection.contract?.contractNumber || 'Chưa link'}</p>
                    <p>Nguồn bill: {selectedConnection.statusSummary?.billingSourceLabel || 'Chưa chọn'}</p>
                    <p>
                      Monthly metric gần nhất:{' '}
                      {latestMonthlyMetric?.periodKey || 'Chưa có normalized monthly'}
                    </p>
                    <p>
                      Giá trị billing gần nhất:{' '}
                      {renderMetricValue(
                        selectedConnection.statusSummary?.billingSourceValue,
                        ' kWh',
                      )}
                    </p>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                    <div className="flex items-center gap-3">
                      <Link2 className="h-4 w-4 text-slate-400" />
                      <p className="font-medium text-white">
                        Flow đang dùng: monitor LuxPower {'->'} normalized metric {'->'} linked system {'->'} monthly billing
                      </p>
                    </div>
                  </div>

                  {canManageConfig ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void saveConnection()}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Lưu liên kết
                      </button>
                    </div>
                  ) : null}
                </SectionCard>
              </div>

              {viewMode === 'debug' && canViewDebug ? (
                <>
                  <SectionCard
                    title="Debug LuxPower"
                    eyebrow="Raw snapshots, normalized metrics và payload kiểm tra mapping"
                    dark
                  >
                    <div className="grid gap-5 xl:grid-cols-2">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Normalized metrics gần nhất
                        </p>
                        {(selectedConnection.normalizedMetrics || [])
                          .slice(0, 6)
                          .map((metric: LuxPowerNormalizedMetricRecord) => (
                            <div
                              key={metric.id}
                              className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-white">
                                  {metric.granularity} - {metric.periodKey}
                                </p>
                                <StatusPill label={metric.granularity} />
                              </div>
                              <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-300">
                                {renderJsonBlock(metric.rawPayload)}
                              </pre>
                            </div>
                          ))}
                        {!selectedConnection.normalizedMetrics?.length ? (
                          <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                            Chưa có normalized metrics.
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Raw/debug snapshots gần nhất
                        </p>
                        {(selectedConnection.debugSnapshots || [])
                          .slice(0, 6)
                          .map((snapshot: LuxPowerDebugSnapshotRecord) => (
                            <div
                              key={snapshot.id}
                              className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-white">
                                  {snapshot.snapshotType}
                                </p>
                                <span className="text-xs text-slate-500">
                                  {formatDateTime(snapshot.capturedAt)}
                                </span>
                              </div>
                              <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-300">
                                {renderJsonBlock(snapshot.payload)}
                              </pre>
                            </div>
                          ))}
                        {!selectedConnection.debugSnapshots?.length ? (
                          <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                            Chưa có debug snapshot.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Kết quả test gần nhất"
                    eyebrow="Plant detail, aggregate rows và snapshot đã fetch được"
                    dark
                  >
                    {testResult ? (
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
                          <p>Plant: {testResult.plantDetail?.plantName || testResult.snapshot.plantName || 'Chưa có'}</p>
                          <p>Serial: {testResult.snapshot.serialNumber || 'Chưa có'}</p>
                          <p>Daily aggregate rows: {formatNumber(testResult.dailyAggregatePoints?.length || 0)}</p>
                          <p>Monthly aggregate rows: {formatNumber(testResult.monthlyAggregatePoints?.length || 0)}</p>
                          <p>Warnings: {testResult.warnings?.length || 0}</p>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                          <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                            {renderJsonBlock(testResult.snapshot)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-300">Chưa có test result trong phiên này.</p>
                    )}
                  </SectionCard>
                </>
              ) : null}

              <SectionCard title="4. Đồng bộ vào hệ thống" eyebrow="Theo dõi nhật ký login, fetch, normalize và billing" dark>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{log.action}</p>
                        <StatusPill label={log.status} />
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{log.message}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  ))}
                  {!logs.length ? (
                    <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                      Chưa có log đồng bộ.
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
