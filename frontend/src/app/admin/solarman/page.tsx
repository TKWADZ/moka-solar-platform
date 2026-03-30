'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bug,
  Plus,
  RefreshCw,
  SatelliteDish,
  Trash2,
  Zap,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  createSolarmanConnectionRequest,
  deleteSolarmanConnectionRequest,
  getSolarmanConnectionRequest,
  listCustomersRequest,
  listSolarmanConnectionsRequest,
  listSolarmanSyncLogsRequest,
  syncSolarmanConnectionRequest,
  testSolarmanConnectionRequest,
  updateSolarmanConnectionRequest,
} from '@/lib/api';
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import {
  CustomerRecord,
  SolarmanConnectionRecord,
  SolarmanStationRecord,
  SolarmanSyncLogRecord,
  SolarmanSyncStationResult,
} from '@/types';

type ConnectionFormState = {
  accountName: string;
  usernameOrEmail: string;
  password: string;
  customerId: string;
  defaultUnitPrice: string;
  defaultTaxAmount: string;
  defaultDiscountAmount: string;
  status: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof ConnectionFormState, string>>;

const connectionStatusOptions = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'ERROR', label: 'Đang lỗi' },
];

function emptyForm(): ConnectionFormState {
  return {
    accountName: '',
    usernameOrEmail: '',
    password: '',
    customerId: '',
    defaultUnitPrice: '',
    defaultTaxAmount: '',
    defaultDiscountAmount: '',
    status: 'ACTIVE',
    notes: '',
  };
}

function buildForm(connection: SolarmanConnectionRecord | null): ConnectionFormState {
  if (!connection) {
    return emptyForm();
  }

  return {
    accountName: connection.accountName || '',
    usernameOrEmail: connection.usernameOrEmail || '',
    password: '',
    customerId: connection.customerId || '',
    defaultUnitPrice:
      connection.defaultUnitPrice !== null && connection.defaultUnitPrice !== undefined
        ? String(connection.defaultUnitPrice)
        : '',
    defaultTaxAmount:
      connection.defaultTaxAmount !== null && connection.defaultTaxAmount !== undefined
        ? String(connection.defaultTaxAmount)
        : '',
    defaultDiscountAmount:
      connection.defaultDiscountAmount !== null &&
      connection.defaultDiscountAmount !== undefined
        ? String(connection.defaultDiscountAmount)
        : '',
    status: connection.status || 'ACTIVE',
    notes: connection.notes || '',
  };
}

function validateForm(form: ConnectionFormState, mode: 'create' | 'edit') {
  const errors: FieldErrors = {};

  if (!form.accountName.trim()) {
    errors.accountName = 'Vui lòng nhập tên connection.';
  }

  if (!form.usernameOrEmail.trim()) {
    errors.usernameOrEmail = 'Vui lòng nhập tài khoản SOLARMAN.';
  }

  if (mode === 'create' && !form.password.trim()) {
    errors.password = 'Vui lòng nhập mật khẩu SOLARMAN.';
  }

  if (form.defaultUnitPrice.trim() && Number(form.defaultUnitPrice) < 0) {
    errors.defaultUnitPrice = 'Đơn giá mặc định không hợp lệ.';
  }

  if (form.defaultTaxAmount.trim() && Number(form.defaultTaxAmount) < 0) {
    errors.defaultTaxAmount = 'Thuế mặc định không hợp lệ.';
  }

  if (form.defaultDiscountAmount.trim() && Number(form.defaultDiscountAmount) < 0) {
    errors.defaultDiscountAmount = 'Chiết khấu mặc định không hợp lệ.';
  }

  return errors;
}

function statusBadge(status: string) {
  switch (status) {
    case 'SUCCESS':
    case 'ACTIVE':
      return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100';
    case 'RUNNING':
      return 'border-sky-300/20 bg-sky-400/10 text-sky-100';
    case 'WARNING':
    case 'PAUSED':
      return 'border-amber-300/20 bg-amber-400/10 text-amber-100';
    case 'ERROR':
      return 'border-rose-300/20 bg-rose-400/10 text-rose-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

export default function AdminSolarmanPage() {
  const [connections, setConnections] = useState<SolarmanConnectionRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [logs, setLogs] = useState<SolarmanSyncLogRecord[]>([]);
  const [stations, setStations] = useState<SolarmanStationRecord[]>([]);
  const [syncStations, setSyncStations] = useState<SolarmanSyncStationResult[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [syncYear, setSyncYear] = useState(String(new Date().getFullYear()));
  const [createMissingSystems, setCreateMissingSystems] = useState(true);
  const [form, setForm] = useState<ConnectionFormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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

  const filteredConnections = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return connections;
    }

    return connections.filter((connection) =>
      [
        connection.accountName,
        connection.usernameOrEmail,
        connection.customer?.companyName,
        connection.customer?.user?.fullName,
        connection.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [connections, search]);

  const stats = useMemo(() => {
    const totalConnections = connections.length;
    const totalSystems = connections.reduce(
      (sum, connection) => sum + (connection.systems?.length || 0),
      0,
    );
    const activeConnections = connections.filter((item) => item.status === 'ACTIVE').length;

    return { totalConnections, totalSystems, activeConnections };
  }, [connections]);

  async function loadData(nextSelectedId?: string) {
    const [nextConnections, nextCustomers] = await Promise.all([
      listSolarmanConnectionsRequest(),
      listCustomersRequest(),
    ]);

    setConnections(nextConnections);
    setCustomers(nextCustomers);

    const fallbackId = nextSelectedId || nextConnections[0]?.id || '';
    setSelectedId(fallbackId);

    if (!fallbackId) {
      setLogs([]);
      if (mode === 'edit') {
        setForm(emptyForm());
      }
      return;
    }

    const [detail, nextLogs] = await Promise.all([
      getSolarmanConnectionRequest(fallbackId),
      listSolarmanSyncLogsRequest(fallbackId),
    ]);

    setLogs(nextLogs);
    if (mode === 'edit') {
      setForm(buildForm(detail));
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Không thể tải cấu hình SOLARMAN.',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildForm(selectedConnection));
      setFieldErrors({});
    }
  }, [mode, selectedConnection]);

  useEffect(() => {
    if (mode !== 'edit' || !selectedId) {
      return;
    }

    let active = true;

    Promise.all([
      getSolarmanConnectionRequest(selectedId),
      listSolarmanSyncLogsRequest(selectedId),
    ])
      .then(([detail, nextLogs]) => {
        if (!active) {
          return;
        }

        setConnections((current) =>
          current.map((item) => (item.id === detail.id ? detail : item)),
        );
        setLogs(nextLogs);
        setForm(buildForm(detail));
      })
      .catch(() => {
        if (active) {
          setLogs(selectedConnection?.syncLogs || []);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedId]);

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
    setStations([]);
    setSyncStations([]);
    setLogs([]);
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  function startEdit(id: string) {
    setMode('edit');
    setSelectedId(id);
    setStations([]);
    setSyncStations([]);
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await loadData(selectedId);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể tải lại cấu hình SOLARMAN.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      usernameOrEmail: form.usernameOrEmail.trim(),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      ...(form.customerId ? { customerId: form.customerId } : {}),
      ...(form.defaultUnitPrice.trim()
        ? { defaultUnitPrice: Number(form.defaultUnitPrice) }
        : {}),
      ...(form.defaultTaxAmount.trim()
        ? { defaultTaxAmount: Number(form.defaultTaxAmount) }
        : {}),
      ...(form.defaultDiscountAmount.trim()
        ? { defaultDiscountAmount: Number(form.defaultDiscountAmount) }
        : {}),
      status: form.status,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await createSolarmanConnectionRequest({
          ...payload,
          password: form.password.trim(),
        });
        await loadData(created.id);
        setMode('edit');
        setMessage('Đã lưu connection SOLARMAN mới.');
      } else if (selectedConnection) {
        const updated = await updateSolarmanConnectionRequest(selectedConnection.id, payload);
        await loadData(updated.id);
        setMessage('Đã cập nhật cấu hình SOLARMAN.');
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể lưu connection SOLARMAN.',
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
      const result = await testSolarmanConnectionRequest(selectedConnection.id);
      setStations(result.stations);
      setSyncStations([]);
      await loadData(selectedConnection.id);
      setMessage(
        `Kết nối thành công. Nhận ${formatNumber(result.stations.length)} station từ SOLARMAN.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Test connection SOLARMAN thất bại.',
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
      const result = await syncSolarmanConnectionRequest(selectedConnection.id, {
        year: Number(syncYear),
        createMissingSystems,
      });
      setSyncStations(result.stations);
      await loadData(selectedConnection.id);
      setMessage(
        `Đã đồng bộ ${formatNumber(result.syncedStations)} station, ${formatNumber(result.syncedMonths)} record tháng và ${formatNumber(result.syncedBillings)} billing record.`,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Đồng bộ SOLARMAN thất bại.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!selectedConnection) {
      return;
    }

    if (!window.confirm(`Lưu trữ connection "${selectedConnection.accountName}"?`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await deleteSolarmanConnectionRequest(selectedConnection.id);
      await loadData();
      setMode('edit');
      setStations([]);
      setSyncStations([]);
      setMessage('Đã lưu trữ connection SOLARMAN.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể lưu trữ connection.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="SOLARMAN" eyebrow="Kết nối customer account và đồng bộ station" dark>
        <p className="text-sm text-slate-300">Đang tải cấu hình SOLARMAN...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Connection đang quản lý</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(stats.totalConnections)}
          </p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">System đã gắn từ SOLARMAN</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(stats.totalSystems)}
          </p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Connection đang hoạt động</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(stats.activeConnections)}
          </p>
        </div>
      </div>

      {selectedConnection ? (
        <SectionCard
          title="Trạng thái tích hợp SOLARMAN"
          eyebrow="Phân biệt rõ cấu hình, đăng nhập, đồng bộ station và phạm vi dữ liệu"
          dark
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Cấu hình account</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {selectedConnection.statusSummary?.configured ? 'Đã lưu đủ credential' : 'Chưa đủ credential'}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedConnection.statusSummary?.configured
                    ? 'Backend có thể thử đăng nhập SOLARMAN.'
                    : 'Hãy kiểm tra lại username/email và mật khẩu đã lưu.'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Liên kết khách hàng</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {selectedConnection.statusSummary?.customerLinked
                    ? selectedConnection.customer?.companyName || selectedConnection.customer?.user?.fullName || 'Đã gắn'
                    : 'Chưa gắn'}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedConnection.statusSummary?.customerLinked
                    ? 'Có thể map station vào system đúng khách này.'
                    : 'Nếu muốn tự tạo system từ station, hãy gắn customer cho connection.'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Test đăng nhập gần nhất</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {selectedConnection.statusSummary?.lastTestStatus || 'Chưa test'}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedConnection.statusSummary?.lastTestAt
                    ? formatDateTime(selectedConnection.statusSummary.lastTestAt)
                    : 'Chưa có timestamp'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Map station vào system</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatNumber(selectedConnection.statusSummary?.mappedStations || 0)} station • {formatNumber(selectedConnection.statusSummary?.mappedSystems || 0)} system
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Sau khi sync tháng, billing sẽ bám theo các system đã map.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="portal-card-soft p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Sync station / monthly history</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {selectedConnection.statusSummary?.lastSyncStatus || 'Chưa sync'}
                      {selectedConnection.statusSummary?.lastSyncAt
                        ? ` • ${formatDateTime(selectedConnection.statusSummary.lastSyncAt)}`
                        : ''}
                    </p>
                  </div>
                  <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', statusBadge(selectedConnection.statusSummary?.lastSyncStatus || selectedConnection.status))}>
                    {selectedConnection.statusSummary?.lastSyncStatus || selectedConnection.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {selectedConnection.statusSummary?.lastSyncMessage || 'Chưa có lần đồng bộ nào được ghi nhận.'}
                </p>
              </div>

              <div className="portal-card-soft p-4">
                <p className="text-sm font-semibold text-white">Realtime / telemetry</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {selectedConnection.statusSummary?.realtimeMessage ||
                    'Luồng SOLARMAN hiện chưa có realtime telemetry.'}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Điều này không đồng nghĩa hệ thống của khách đang lỗi vận hành.
                </p>
              </div>

              <div className="portal-card-soft p-4">
                <p className="text-sm font-semibold text-white">Troubleshooting nhanh</p>
                <div className="mt-3 space-y-3 text-sm text-slate-300">
                  <p>
                    Lỗi gần nhất:{' '}
                    <span className="text-slate-100">
                      {selectedConnection.statusSummary?.lastFailureMessage || 'Chưa có'}
                    </span>
                  </p>
                  <p>
                    Kết quả test gần nhất:{' '}
                    <span className="text-slate-100">
                      {selectedConnection.statusSummary?.lastTestMessage || 'Chưa có'}
                    </span>
                  </p>
                  <p>
                    Hướng xử lý: nếu login thành công nhưng station = 0, hãy kiểm tra account customer có đúng plant/station của khách hay không.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SectionCard title="Danh sách connection SOLARMAN" eyebrow="Lưu tài khoản customer account theo từng khách hàng" dark>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={startCreate}>
                <Plus className="h-4 w-4" />
                Thêm connection
              </button>
              <button type="button" className="btn-ghost" onClick={() => void handleRefresh()}>
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </button>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Tìm connection</span>
              <input
                className="portal-field"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên account, email SOLARMAN, khách hàng..."
              />
            </label>

            <div className="space-y-3">
              {filteredConnections.length ? (
                filteredConnections.map((connection) => {
                  const selected = mode === 'edit' && selectedId === connection.id;
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={() => startEdit(connection.id)}
                      className={cn(
                        'w-full rounded-[24px] border px-4 py-4 text-left transition',
                        selected
                          ? 'border-white/20 bg-white text-slate-950'
                          : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">{connection.accountName}</p>
                          <p className={cn('mt-1 text-sm', selected ? 'text-slate-600' : 'text-slate-400')}>
                            {connection.usernameOrEmail}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-semibold',
                            selected ? 'border-slate-900/10 bg-slate-950 text-white' : statusBadge(connection.status),
                          )}
                        >
                          {connection.status}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                          selected ? 'text-slate-700' : 'text-slate-300',
                        )}
                      >
                        <p>Khách hàng: {connection.customer?.companyName || connection.customer?.user?.fullName || 'Chưa gắn'}</p>
                        <p>System đã map: {formatNumber(connection.systems?.length || 0)}</p>
                        <p>Lần sync gần nhất: {connection.lastSyncTime ? formatDateTime(connection.lastSyncTime) : 'Chưa có'}</p>
                        <p>Đơn giá mặc định: {connection.defaultUnitPrice ? formatCurrency(connection.defaultUnitPrice) : 'Chưa cấu hình'}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Chưa có connection SOLARMAN nào. Tạo connection đầu tiên để bắt đầu đồng bộ station và sản lượng PV theo tháng.
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={mode === 'create' ? 'Tạo connection SOLARMAN' : 'Cấu hình connection SOLARMAN'}
          eyebrow={mode === 'create' ? 'Lưu customer account để backend đăng nhập và đồng bộ thật' : 'Test connection, sync station và đẩy dữ liệu PV tháng vào billing'}
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
                  placeholder="Ví dụ: VP Vạn Phúc - customer account"
                />
                {fieldErrors.accountName ? <span className="text-xs text-rose-300">{fieldErrors.accountName}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tài khoản SOLARMAN</span>
                <input
                  className={cn('portal-field', fieldErrors.usernameOrEmail && 'border-rose-300/40')}
                  value={form.usernameOrEmail}
                  onChange={(event) => updateField('usernameOrEmail', event.target.value)}
                  placeholder="Email hoặc username customer account"
                />
                {fieldErrors.usernameOrEmail ? <span className="text-xs text-rose-300">{fieldErrors.usernameOrEmail}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{mode === 'create' ? 'Mật khẩu SOLARMAN' : 'Đổi mật khẩu SOLARMAN'}</span>
                <input
                  type="password"
                  className={cn('portal-field', fieldErrors.password && 'border-rose-300/40')}
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder={mode === 'create' ? 'Nhập mật khẩu customer account' : 'Để trống nếu giữ nguyên'}
                />
                {fieldErrors.password ? <span className="text-xs text-rose-300">{fieldErrors.password}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Khách hàng mặc định</span>
                <select
                  className="portal-field"
                  value={form.customerId}
                  onChange={(event) => updateField('customerId', event.target.value)}
                >
                  <option value="">Chưa gắn khách hàng</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName || customer.user.fullName} - {customer.customerCode}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Đơn giá mặc định (VND/kWh)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={cn('portal-field', fieldErrors.defaultUnitPrice && 'border-rose-300/40')}
                  value={form.defaultUnitPrice}
                  onChange={(event) => updateField('defaultUnitPrice', event.target.value)}
                  placeholder="Ví dụ: 2250"
                />
                {fieldErrors.defaultUnitPrice ? <span className="text-xs text-rose-300">{fieldErrors.defaultUnitPrice}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Thuế mặc định</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={cn('portal-field', fieldErrors.defaultTaxAmount && 'border-rose-300/40')}
                  value={form.defaultTaxAmount}
                  onChange={(event) => updateField('defaultTaxAmount', event.target.value)}
                  placeholder="Giá trị tiền thuế"
                />
                {fieldErrors.defaultTaxAmount ? <span className="text-xs text-rose-300">{fieldErrors.defaultTaxAmount}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Chiết khấu mặc định</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={cn('portal-field', fieldErrors.defaultDiscountAmount && 'border-rose-300/40')}
                  value={form.defaultDiscountAmount}
                  onChange={(event) => updateField('defaultDiscountAmount', event.target.value)}
                  placeholder="Giá trị chiết khấu"
                />
                {fieldErrors.defaultDiscountAmount ? <span className="text-xs text-rose-300">{fieldErrors.defaultDiscountAmount}</span> : null}
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
                  {connectionStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Năm cần đồng bộ</span>
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  className="portal-field"
                  value={syncYear}
                  onChange={(event) => setSyncYear(event.target.value)}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Ghi chú</span>
              <textarea
                className="portal-field min-h-[110px]"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Ví dụ: account của VP 11 đường số 2, dùng để sync PV tháng cho khách doanh nghiệp..."
              />
            </label>

            {selectedConnection && mode === 'edit' ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Token lưu gần nhất</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {selectedConnection.accessTokenPreview || 'Chưa có'}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Lần sync gần nhất</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {selectedConnection.lastSyncTime ? formatDateTime(selectedConnection.lastSyncTime) : 'Chưa có'}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Mật khẩu đã lưu</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {selectedConnection.hasStoredPassword ? 'Đã mã hóa' : 'Chưa có'}
                  </p>
                </div>
              </div>
            ) : null}

            <label className="inline-flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-white"
                checked={createMissingSystems}
                onChange={(event) => setCreateMissingSystems(event.target.checked)}
              />
              Tự tạo hệ thống mới nếu station chưa được map vào system hiện có
            </label>

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

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : mode === 'create' ? 'Lưu connection' : 'Lưu thay đổi'}
              </button>

              {mode === 'edit' && selectedConnection ? (
                <>
                  <button type="button" className="btn-ghost" disabled={testing} onClick={() => void handleTestConnection()}>
                    <Bug className="h-4 w-4" />
                    {testing ? 'Đang test...' : 'Test connection'}
                  </button>
                  <button type="button" className="btn-ghost" disabled={syncing} onClick={() => void handleSyncNow()}>
                    <Zap className="h-4 w-4" />
                    {syncing ? 'Đang sync...' : 'Sync ngay'}
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)]">
        <SectionCard title="Station và system đã đồng bộ" eyebrow="Danh sách nhà máy nhận được từ SOLARMAN và map vào hệ thống nội bộ" dark>
          <div className="grid gap-4">
            {stations.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {stations.map((station) => (
                  <div key={station.stationId} className="portal-card-soft p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white">
                          {station.stationName || station.stationId}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {station.stationId}
                        </p>
                      </div>
                      <SatelliteDish className="h-5 w-5 shrink-0 text-slate-400" />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <p>Công suất: {station.installedCapacityKw ? formatNumber(station.installedCapacityKw, 'kWp') : 'Chưa có'}</p>
                      <p>PV tháng hiện tại: {station.generationMonthKwh ? formatNumber(station.generationMonthKwh, 'kWh') : 'Chưa có'}</p>
                      <p>PV năm: {station.generationYearKwh ? formatNumber(station.generationYearKwh, 'kWh') : 'Chưa có'}</p>
                      <p>Tổng sản lượng: {station.generationTotalKwh ? formatNumber(station.generationTotalKwh, 'kWh') : 'Chưa có'}</p>
                      <p>Lần cập nhật: {station.lastUpdateTime ? formatDateTime(station.lastUpdateTime) : 'Chưa có'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : syncStations.length ? (
              <div className="grid gap-3">
                {syncStations.map((station) => (
                  <div key={station.stationId} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white">
                          {station.stationName || station.stationId}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {station.systemName
                            ? `Đã map vào ${station.systemName}`
                            : station.reason || 'Đã xử lý sync'}
                        </p>
                      </div>
                      <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', station.stationSynced ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/20 bg-amber-400/10 text-amber-100')}>
                        {station.stationSynced ? 'Đã đồng bộ' : 'Cần xử lý'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p>Record tháng: {formatNumber(station.syncedMonths)}</p>
                      <p>Billing record: {formatNumber(station.syncedBillings)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : selectedConnection?.systems?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedConnection.systems.map((system) => (
                  <div key={system.id} className="portal-card-soft p-4">
                    <p className="text-base font-semibold text-white">{system.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {system.systemCode}
                    </p>
                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <p>Station ID: {system.stationId || system.monitoringPlantId || 'Chưa gắn'}</p>
                      <p>PV năm: {system.currentYearGenerationKwh ? formatNumber(system.currentYearGenerationKwh, 'kWh') : 'Chưa có'}</p>
                      <p>Đơn giá mặc định: {system.defaultUnitPrice ? formatCurrency(system.defaultUnitPrice) : 'Chưa có'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                Chưa có station nào được hiển thị. Hãy test connection để xem station list hoặc bấm sync để backend lấy monthly PV generation và tạo system nếu cần.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Lịch sử đồng bộ" eyebrow="Sync log và cảnh báo login/session/monthly endpoint" dark>
          <div className="grid gap-3">
            {logs.length ? (
              logs.map((log) => (
                <div key={log.id} className="portal-card-soft p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{log.action}</p>
                      <p className="mt-1 text-sm text-slate-300">{log.message}</p>
                    </div>
                    <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', statusBadge(log.status))}>
                      {log.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Bắt đầu: {formatDateTime(log.startedAt)}</p>
                    <p>Kết thúc: {log.finishedAt ? formatDateTime(log.finishedAt) : 'Đang chạy'}</p>
                    <p>Station: {formatNumber(log.syncedStations)}</p>
                    <p>Record tháng: {formatNumber(log.syncedMonths)}</p>
                    <p>Billing: {formatNumber(log.syncedBillings)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="portal-card-soft p-5 text-sm leading-6 text-slate-300">
                Chưa có log đồng bộ. Sau khi test hoặc sync connection, lịch sử xử lý sẽ xuất hiện ở đây để đối soát login, station list và monthly history.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
