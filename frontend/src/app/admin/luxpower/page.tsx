'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  Bug,
  CloudSun,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  createLuxPowerConnectionRequest,
  deleteLuxPowerConnectionRequest,
  getLuxPowerConnectionRequest,
  listAdminSystemsRequest,
  listLuxPowerConnectionsRequest,
  listLuxPowerSyncLogsRequest,
  syncLuxPowerConnectionRequest,
  testLuxPowerConnectionRequest,
  updateLuxPowerConnectionRequest,
} from '@/lib/api';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  AdminSystemRecord,
  LuxPowerConnectionRecord,
  LuxPowerMonitorSnapshot,
  LuxPowerPlantRecord,
  LuxPowerSyncLogRecord,
  LuxPowerTestResponse,
} from '@/types';

type ConnectionFormState = {
  accountName: string;
  username: string;
  password: string;
  plantId: string;
  inverterSerial: string;
  solarSystemId: string;
  pollingIntervalMinutes: string;
  useDemoMode: boolean;
  status: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof ConnectionFormState, string>>;

const statusOptions = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'PENDING', label: 'Chờ cấu hình' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'ERROR', label: 'Đang lỗi' },
];

function emptyForm(): ConnectionFormState {
  return {
    accountName: '',
    username: '',
    password: '',
    plantId: '',
    inverterSerial: '',
    solarSystemId: '',
    pollingIntervalMinutes: '60',
    useDemoMode: false,
    status: 'ACTIVE',
    notes: '',
  };
}

function buildForm(connection: LuxPowerConnectionRecord | null): ConnectionFormState {
  if (!connection) {
    return emptyForm();
  }

  return {
    accountName: connection.accountName || '',
    username: connection.username || '',
    password: '',
    plantId: connection.plantId || '',
    inverterSerial: connection.inverterSerial || '',
    solarSystemId: connection.solarSystemId || '',
    pollingIntervalMinutes: String(connection.pollingIntervalMinutes || 60),
    useDemoMode: Boolean(connection.useDemoMode),
    status: connection.status || 'ACTIVE',
    notes: connection.notes || '',
  };
}

function validateForm(form: ConnectionFormState, mode: 'create' | 'edit') {
  const errors: FieldErrors = {};

  if (!form.accountName.trim()) {
    errors.accountName = 'Vui lòng nhập tên connection.';
  }

  if (!form.useDemoMode && !form.username.trim()) {
    errors.username = 'LuxPower username là bắt buộc.';
  }

  if (!form.useDemoMode && mode === 'create' && !form.password.trim()) {
    errors.password = 'LuxPower password là bắt buộc.';
  }

  const polling = Number(form.pollingIntervalMinutes);
  if (!Number.isFinite(polling) || polling < 5 || polling > 1440) {
    errors.pollingIntervalMinutes = 'Polling interval phải nằm trong khoảng 5-1440 phút.';
  }

  return errors;
}

function logTone(status?: string | null) {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
    case 'ACTIVE':
      return 'success' as const;
    case 'RUNNING':
    case 'PENDING':
      return 'warning' as const;
    case 'ERROR':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

function snapshotMetricLabel(value?: number | null, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Chưa có';
  }

  return formatNumber(value, suffix);
}

export default function AdminLuxPowerPage() {
  const [connections, setConnections] = useState<LuxPowerConnectionRecord[]>([]);
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [logs, setLogs] = useState<LuxPowerSyncLogRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<ConnectionFormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [testResult, setTestResult] = useState<LuxPowerTestResponse | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<LuxPowerMonitorSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedId) || null,
    [connections, selectedId],
  );

  async function loadReferenceData(nextSelectedId?: string) {
    const [nextConnections, nextSystems] = await Promise.all([
      listLuxPowerConnectionsRequest(),
      listAdminSystemsRequest(),
    ]);

    setConnections(nextConnections);
    setSystems(nextSystems);

    const fallbackId = nextSelectedId || nextConnections[0]?.id || '';
    setSelectedId(fallbackId);

    if (!fallbackId) {
      setMode('create');
      setLogs([]);
      setForm(emptyForm());
      return;
    }

    const [detail, nextLogs] = await Promise.all([
      getLuxPowerConnectionRequest(fallbackId),
      listLuxPowerSyncLogsRequest(fallbackId),
    ]);

    setMode('edit');
    setForm(buildForm(detail));
    setLogs(nextLogs);
  }

  useEffect(() => {
    loadReferenceData()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải cấu hình LuxPower.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function updateField<K extends keyof ConnectionFormState>(
    key: K,
    value: ConnectionFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function startCreate() {
    setMode('create');
    setSelectedId('');
    setForm(emptyForm());
    setFieldErrors({});
    setLogs([]);
    setTestResult(null);
    setLastSnapshot(null);
    setWarnings([]);
    setMessage('');
    setError('');
  }

  async function startEdit(id: string) {
    setMode('edit');
    setSelectedId(id);
    setMessage('');
    setError('');
    setTestResult(null);
    setWarnings([]);

    try {
      const [detail, nextLogs] = await Promise.all([
        getLuxPowerConnectionRequest(id),
        listLuxPowerSyncLogsRequest(id),
      ]);

      setForm(buildForm(detail));
      setLogs(nextLogs);
      const snapshot = detail.lastProviderResponse as LuxPowerMonitorSnapshot | null;
      setLastSnapshot(snapshot || null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải chi tiết LuxPower connection.',
      );
    }
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await loadReferenceData(selectedId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải lại cấu hình LuxPower.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    const nextErrors = validateForm(form, mode);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Vui lòng kiểm tra lại các trường đang được đánh dấu.');
      return;
    }

    const payload = {
      accountName: form.accountName.trim(),
      username: form.useDemoMode ? undefined : form.username.trim() || undefined,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      plantId: form.plantId.trim() || undefined,
      inverterSerial: form.inverterSerial.trim() || undefined,
      solarSystemId: form.solarSystemId || undefined,
      pollingIntervalMinutes: Number(form.pollingIntervalMinutes),
      useDemoMode: form.useDemoMode,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await createLuxPowerConnectionRequest(payload);
        await loadReferenceData(created.id);
        setMode('edit');
        setMessage('Đã lưu LuxPower connection mới.');
      } else if (selectedConnection) {
        const updated = await updateLuxPowerConnectionRequest(selectedConnection.id, payload);
        await loadReferenceData(updated.id);
        setMessage('Đã cập nhật cấu hình LuxPower.');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu LuxPower connection.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!selectedConnection) {
      setError('Hãy lưu connection trước khi test.');
      return;
    }

    setTesting(true);
    setMessage('');
    setError('');
    try {
      const result = await testLuxPowerConnectionRequest(selectedConnection.id);
      setTestResult(result);
      setLastSnapshot(result.snapshot);
      setWarnings(result.warnings || []);
      await loadReferenceData(selectedConnection.id);
      setMessage(
        result.sessionMode === 'DEMO'
          ? 'Đã lấy mẫu monitor từ LuxPower demo công khai.'
          : 'Đã đăng nhập LuxPower và lấy được snapshot monitor.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Test LuxPower connection thất bại.',
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncNow() {
    if (!selectedConnection) {
      setError('Hãy lưu connection trước khi đồng bộ.');
      return;
    }

    setSyncing(true);
    setMessage('');
    setError('');
    try {
      const result = await syncLuxPowerConnectionRequest(selectedConnection.id);
      setLastSnapshot(result.snapshot);
      setWarnings(result.warnings || []);
      await loadReferenceData(selectedConnection.id);
      setMessage(
        result.systemUpdated
          ? 'Đã đồng bộ LuxPower snapshot vào hệ thống đã liên kết.'
          : 'Đã lấy LuxPower snapshot nhưng connection chưa gắn với system để đẩy vào portal.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Đồng bộ LuxPower thất bại.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!selectedConnection) {
      return;
    }

    if (!window.confirm(`Lưu trữ LuxPower connection "${selectedConnection.accountName}"?`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteLuxPowerConnectionRequest(selectedConnection.id);
      await loadReferenceData();
      setTestResult(null);
      setLastSnapshot(null);
      setWarnings([]);
      setMessage('Đã lưu trữ LuxPower connection.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu trữ connection.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="LuxPower Cloud" eyebrow="Backend-only cloud session integration" dark>
        <p className="text-sm text-slate-300">Đang tải cấu hình LuxPower...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">LuxPower connection</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(connections.length)}</p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">System đã liên kết</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(connections.filter((item) => item.solarSystemId).length)}
          </p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Connection demo an toàn</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(connections.filter((item) => item.useDemoMode).length)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="LuxPower connection" eyebrow="Danh sách session backend và map vào system" dark>
          <div className="mb-4 flex flex-wrap gap-3">
            <button type="button" onClick={startCreate} className="btn-primary">
              <Plus className="h-4 w-4" />
              Tạo connection
            </button>
            <button type="button" onClick={() => void handleRefresh()} className="btn-ghost">
              <RefreshCw className="h-4 w-4" />
              Tải lại
            </button>
          </div>

          <div className="grid gap-3">
            {connections.length ? (
              connections.map((connection) => {
                const selected = selectedId === connection.id && mode === 'edit';
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => void startEdit(connection.id)}
                    className={cn(
                      'rounded-[22px] border px-4 py-4 text-left transition',
                      selected
                        ? 'border-white/15 bg-white text-slate-950'
                        : 'border-white/8 bg-white/[0.04] text-white hover:bg-white/[0.07]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{connection.accountName}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {connection.useDemoMode ? 'Demo mode' : connection.username || 'Chưa có username'}
                        </p>
                      </div>
                      <StatusPill label={connection.status} tone={logTone(connection.status)} />
                    </div>

                    <div
                      className={cn(
                        'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                        selected ? 'text-slate-700' : 'text-slate-300',
                      )}
                    >
                      <p>System: {connection.solarSystem?.name || 'Chưa gắn'}</p>
                      <p>Plant ID: {connection.plantId || '-'}</p>
                      <p>Serial: {connection.inverterSerial || '-'}</p>
                      <p>
                        Sync gần nhất:{' '}
                        {connection.lastSyncTime ? formatDateTime(connection.lastSyncTime) : 'Chưa có'}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="portal-card-soft p-5 text-sm text-slate-300">
                Chưa có LuxPower connection nào. Tạo một connection để test session cloud và map vào system.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={mode === 'create' ? 'Tạo LuxPower connection' : 'Cấu hình LuxPower connection'}
          eyebrow="Giữ session, password và dữ liệu monitor hoàn toàn ở backend"
          dark
        >
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tên connection</span>
                <input
                  className={cn('portal-field', fieldErrors.accountName && 'border-rose-300/40')}
                  value={form.accountName}
                  onChange={(event) => updateField('accountName', event.target.value)}
                  placeholder="Ví dụ: LuxPower - Ballantine"
                />
                {fieldErrors.accountName ? (
                  <span className="text-xs text-rose-300">{fieldErrors.accountName}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Linked system</span>
                <select
                  className="portal-field"
                  value={form.solarSystemId}
                  onChange={(event) => updateField('solarSystemId', event.target.value)}
                >
                  <option value="">Chưa gắn system</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name} - {system.systemCode}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="inline-flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-white"
                checked={form.useDemoMode}
                onChange={(event) => updateField('useDemoMode', event.target.checked)}
              />
              Dùng portal demo công khai của LuxPower để test cục bộ an toàn
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>LuxPower username</span>
                <input
                  className={cn('portal-field', fieldErrors.username && 'border-rose-300/40')}
                  value={form.username}
                  onChange={(event) => updateField('username', event.target.value)}
                  placeholder={form.useDemoMode ? 'Có thể để trống ở demo mode' : 'Username tài khoản monitor'}
                  disabled={form.useDemoMode}
                />
                {fieldErrors.username ? (
                  <span className="text-xs text-rose-300">{fieldErrors.username}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>{mode === 'create' ? 'LuxPower password' : 'Đổi password LuxPower'}</span>
                <input
                  type="password"
                  className={cn('portal-field', fieldErrors.password && 'border-rose-300/40')}
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder={
                    form.useDemoMode
                      ? 'Không cần ở demo mode'
                      : mode === 'create'
                        ? 'Nhập password portal'
                        : 'Để trống nếu giữ nguyên'
                  }
                  disabled={form.useDemoMode}
                />
                {selectedConnection?.hasStoredPassword && mode === 'edit' ? (
                  <span className="text-xs text-slate-500">Password đang được lưu an toàn ở backend.</span>
                ) : null}
                {fieldErrors.password ? (
                  <span className="text-xs text-rose-300">{fieldErrors.password}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Plant ID</span>
                <input
                  className="portal-field"
                  value={form.plantId}
                  onChange={(event) => updateField('plantId', event.target.value)}
                  placeholder="Ví dụ: 15804"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Inverter serial</span>
                <input
                  className="portal-field"
                  value={form.inverterSerial}
                  onChange={(event) => updateField('inverterSerial', event.target.value)}
                  placeholder="Ví dụ: 1514025004"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Polling interval (phút)</span>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  className={cn(
                    'portal-field',
                    fieldErrors.pollingIntervalMinutes && 'border-rose-300/40',
                  )}
                  value={form.pollingIntervalMinutes}
                  onChange={(event) => updateField('pollingIntervalMinutes', event.target.value)}
                />
                {fieldErrors.pollingIntervalMinutes ? (
                  <span className="text-xs text-rose-300">{fieldErrors.pollingIntervalMinutes}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Trạng thái</span>
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
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Ghi chú</span>
                <input
                  className="portal-field"
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  placeholder="Ví dụ: dùng để map cho villa/homestay cụ thể"
                />
              </label>
            </div>

            <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
              Backend sẽ giữ secret/session và chỉ đẩy snapshot monitor đã normalize vào hệ thống nội bộ.
              Nếu endpoint LuxPower thay đổi hoặc session hết hạn, module sẽ thử đăng nhập lại và log rõ lỗi.
            </div>

            {warnings.length ? (
              <div className="rounded-[18px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
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

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {mode === 'create' ? 'Lưu connection' : 'Lưu thay đổi'}
                  </>
                )}
              </button>

              {mode === 'edit' && selectedConnection ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={testing}
                    onClick={() => void handleTestConnection()}
                  >
                    <Bug className="h-4 w-4" />
                    {testing ? 'Đang test...' : 'Test kết nối'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={syncing}
                    onClick={() => void handleSyncNow()}
                  >
                    <Zap className="h-4 w-4" />
                    {syncing ? 'Đang sync...' : 'Sync snapshot'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                    disabled={saving}
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Lưu trữ connection
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard
          title="Trạng thái monitor LuxPower"
          eyebrow="Snapshot hiện tại và dữ liệu normalized vào Moka"
          dark
        >
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Session mode</p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {selectedConnection?.useDemoMode ? 'DEMO công khai' : 'LOGIN thật'}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedConnection?.statusSummary?.lastSyncAt
                    ? `Sync gần nhất ${formatDateTime(selectedConnection.statusSummary.lastSyncAt)}`
                    : 'Chưa có lần sync nào'}
                </p>
              </div>
              <StatusPill
                label={selectedConnection?.status || 'PENDING'}
                tone={logTone(selectedConnection?.status)}
              />
            </div>

            {lastSnapshot ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { title: 'PV power', value: snapshotMetricLabel(lastSnapshot.currentPvKw, 'kW'), icon: CloudSun },
                  { title: 'Battery SOC', value: snapshotMetricLabel(lastSnapshot.batterySocPct, '%'), icon: BatteryCharging },
                  { title: 'Load power', value: snapshotMetricLabel(lastSnapshot.loadPowerKw, 'kW'), icon: Zap },
                  { title: 'Today generation', value: snapshotMetricLabel(lastSnapshot.todayGenerationKwh, 'kWh'), icon: ShieldCheck },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="portal-card-soft p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-400">{item.title}</p>
                          <p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
                        </div>
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-100">
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                Chưa có snapshot LuxPower nào. Hãy test connection hoặc sync snapshot để xem dữ liệu monitor normalize.
              </div>
            )}

            {lastSnapshot ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  <p>Plant: <span className="font-medium text-white">{lastSnapshot.plantName || lastSnapshot.plantId || '-'}</span></p>
                  <p>Serial: <span className="font-medium text-white">{lastSnapshot.serialNumber || '-'}</span></p>
                  <p>Status: <span className="font-medium text-white">{lastSnapshot.inverterStatus || 'Chưa có'}</span></p>
                  <p>Fetched at: <span className="font-medium text-white">{formatDateTime(lastSnapshot.fetchedAt)}</span></p>
                  <p>Grid import: <span className="font-medium text-white">{snapshotMetricLabel(lastSnapshot.gridImportKw, 'kW')}</span></p>
                  <p>Grid export: <span className="font-medium text-white">{snapshotMetricLabel(lastSnapshot.gridExportKw, 'kW')}</span></p>
                  <p>Total generation: <span className="font-medium text-white">{snapshotMetricLabel(lastSnapshot.totalGenerationKwh, 'kWh')}</span></p>
                  <p>Day points: <span className="font-medium text-white">{formatNumber(lastSnapshot.daySeries?.length || 0)}</span></p>
                </div>
              </div>
            ) : null}

            {testResult?.plants?.length ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Plant discover</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {testResult.plants.slice(0, 6).map((plant: LuxPowerPlantRecord) => (
                    <div key={plant.plantId} className="rounded-[16px] border border-white/6 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                      <p className="font-medium text-white">{plant.plantName || plant.plantId}</p>
                      <p className="mt-1 text-xs text-slate-500">{plant.plantId}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Nhật ký LuxPower" eyebrow="Login, fetch và phản hồi provider gần đây" dark>
          <div className="grid gap-3">
            {logs.length ? (
              logs.map((log) => (
                <div key={log.id} className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{log.action}</p>
                      <p className="mt-1 text-sm text-slate-300">{log.message}</p>
                    </div>
                    <StatusPill label={log.status} tone={logTone(log.status)} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p>Bắt đầu: {formatDateTime(log.startedAt)}</p>
                    <p>Kết thúc: {log.finishedAt ? formatDateTime(log.finishedAt) : 'Đang chạy'}</p>
                    <p>Provider code: {log.providerCode || '-'}</p>
                    <p>Response payload: {log.responsePayload ? 'Có lưu' : 'Không có'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                Chưa có log LuxPower nào. Sau khi test hoặc sync, hệ thống sẽ lưu lại kết quả login/fetch tại đây.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
