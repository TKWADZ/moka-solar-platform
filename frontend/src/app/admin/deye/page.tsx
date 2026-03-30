'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  createDeyeConnectionRequest,
  deleteDeyeConnectionRequest,
  listDeyeConnectionsRequest,
  listDeyeSyncLogsRequest,
  syncDeyeConnectionRequest,
  syncDeyeMonthlyHistoryRequest,
  syncDeyeStationsRequest,
  testDeyeConnectionRequest,
  updateDeyeConnectionRequest,
} from '@/lib/api';
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { DeyeConnectionRecord, DeyeSyncLogRecord } from '@/types';

type ConnectionFormState = {
  accountName: string;
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  baseUrl: string;
  status: string;
};

function emptyForm(): ConnectionFormState {
  return {
    accountName: '',
    appId: '',
    appSecret: '',
    email: '',
    password: '',
    baseUrl: 'https://eu1-developer.deyecloud.com',
    status: 'ACTIVE',
  };
}

function buildForm(connection: DeyeConnectionRecord | null): ConnectionFormState {
  return connection
    ? {
        accountName: connection.accountName || '',
        appId: connection.appId || '',
        appSecret: '',
        email: connection.email || '',
        password: '',
        baseUrl: connection.baseUrl || 'https://eu1-developer.deyecloud.com',
        status: connection.status || 'ACTIVE',
      }
    : emptyForm();
}

function statusBadge(status: string) {
  if (['ACTIVE', 'CONNECTED', 'SYNCED', 'AUTHORIZED', 'SUCCESS'].includes(status)) {
    return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100';
  }
  if (status === 'RUNNING') {
    return 'border-sky-300/20 bg-sky-400/10 text-sky-100';
  }
  if (['PAUSED', 'PENDING'].includes(status)) {
    return 'border-amber-300/20 bg-amber-400/10 text-amber-100';
  }
  return 'border-rose-300/20 bg-rose-400/10 text-rose-100';
}

export default function AdminDeyePage() {
  const [connections, setConnections] = useState<DeyeConnectionRecord[]>([]);
  const [logs, setLogs] = useState<DeyeSyncLogRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ConnectionFormState>(emptyForm());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [startAt, setStartAt] = useState(`${new Date().getFullYear()}-01`);
  const [endAt, setEndAt] = useState(`${new Date().getFullYear()}-12`);
  const [includeStationSync, setIncludeStationSync] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<'test' | 'stations' | 'monthly' | 'all' | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedId) || null,
    [connections, selectedId],
  );

  const filteredConnections = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return connections;
    return connections.filter((item) =>
      [item.accountName, item.email, item.companyName, item.baseUrl, item.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [connections, search]);

  async function loadData(nextSelectedId?: string) {
    const nextConnections = await listDeyeConnectionsRequest();
    setConnections(nextConnections);
    const targetId = nextSelectedId || nextConnections[0]?.id || '';
    setSelectedId(targetId);
    if (!targetId) {
      setLogs([]);
      if (mode === 'edit') setForm(emptyForm());
      return;
    }
    const nextLogs = await listDeyeSyncLogsRequest(targetId);
    setLogs(nextLogs);
    if (mode === 'edit') {
      setForm(buildForm(nextConnections.find((item) => item.id === targetId) || null));
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : 'Không thể tải cấu hình Deye.'),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildForm(selectedConnection));
    }
  }, [mode, selectedConnection]);

  function updateField<K extends keyof ConnectionFormState>(key: K, value: ConnectionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);

    try {
      if (mode === 'create') {
        const created = await createDeyeConnectionRequest({
          accountName: form.accountName.trim(),
          appId: form.appId.trim(),
          appSecret: form.appSecret.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password.trim(),
          baseUrl: form.baseUrl.trim(),
          status: form.status,
        });
        setMode('edit');
        await loadData(created.id);
        setMessage('Đã tạo kết nối Deye mới.');
      } else if (selectedConnection) {
        await updateDeyeConnectionRequest(selectedConnection.id, {
          accountName: form.accountName.trim(),
          appId: form.appId.trim(),
          ...(form.appSecret.trim() ? { appSecret: form.appSecret.trim() } : {}),
          email: form.email.trim().toLowerCase(),
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
          baseUrl: form.baseUrl.trim(),
          status: form.status,
        });
        await loadData(selectedConnection.id);
        setMessage('Đã cập nhật kết nối Deye.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lưu kết nối Deye.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: 'test' | 'stations' | 'monthly' | 'all') {
    if (!selectedConnection) {
      setError('Hãy chọn một kết nối Deye trước.');
      return;
    }
    setWorking(action);
    setMessage('');
    setError('');

    try {
      if (action === 'test') {
        await testDeyeConnectionRequest(selectedConnection.id);
        setMessage('Test connection thành công.');
      }
      if (action === 'stations') {
        const result = await syncDeyeStationsRequest(selectedConnection.id);
        setMessage(`Đã đồng bộ ${result.syncedStations.length} station và device từ Deye.`);
      }
      if (action === 'monthly') {
        const result = await syncDeyeMonthlyHistoryRequest(selectedConnection.id, {
          year: Number(year),
          startAt,
          endAt,
          includeStationSync,
        });
        setMessage(`Đã đồng bộ ${result.syncedMonths} bản ghi PV tháng và ${result.syncedBillings} billing record.`);
      }
      if (action === 'all') {
        const result = await syncDeyeConnectionRequest(selectedConnection.id, {
          year: Number(year),
          startAt,
          endAt,
          includeStationSync,
        });
        setMessage(
          `Sync all thành công: ${result.syncedRealtimeRecords || 0} điểm realtime, ${result.syncedDailyRecords || 0} bản ghi ngày, ${result.syncedMonths} record tháng, ${result.syncedBillings} billing.`,
        );
      }
      await loadData(selectedConnection.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể thực hiện thao tác Deye.');
    } finally {
      setWorking('');
    }
  }

  async function handleDelete() {
    if (!selectedConnection || !window.confirm(`Xóa kết nối "${selectedConnection.accountName}"?`)) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteDeyeConnectionRequest(selectedConnection.id);
      await loadData();
      setMode('edit');
      setMessage('Đã xóa kết nối Deye.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể xóa kết nối Deye.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <SectionCard title="Deye OpenAPI" eyebrow="Token, station, device và monthly billing" dark><p className="text-sm text-slate-300">Đang tải cấu hình Deye...</p></SectionCard>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="Deye Connections" eyebrow="Danh sách kết nối và data center" dark>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => { setMode('create'); setSelectedId(''); setForm(emptyForm()); setLogs([]); setMessage(''); setError(''); }}>
                <Plus className="h-4 w-4" /> Thêm kết nối
              </button>
              <button type="button" className="btn-ghost" onClick={() => void loadData(selectedId)}>
                <RefreshCw className="h-4 w-4" /> Tải lại
              </button>
            </div>
            <input className="portal-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email, company, base URL..." />
            <div className="space-y-3">
              {filteredConnections.map((connection) => (
                <button key={connection.id} type="button" onClick={() => { setMode('edit'); setSelectedId(connection.id); setForm(buildForm(connection)); setMessage(''); setError(''); void loadData(connection.id); }} className={cn('w-full rounded-[24px] border px-4 py-4 text-left transition', selectedId === connection.id ? 'border-white/20 bg-white text-slate-950' : 'border-white/10 bg-white/5 text-white hover:bg-white/10')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{connection.baseUrl}</p>
                      <p className="mt-2 truncate text-lg font-semibold">{connection.accountName}</p>
                      <p className={cn('mt-1 text-sm', selectedId === connection.id ? 'text-slate-600' : 'text-slate-400')}>{connection.companyName || connection.email}</p>
                    </div>
                    <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', statusBadge(connection.status))}>{connection.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title={mode === 'create' ? 'Tạo kết nối Deye' : 'Cấu hình kết nối Deye'} eyebrow="APP_ID, APP_SECRET, email, password và base URL" dark>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input className="portal-field" value={form.accountName} onChange={(event) => updateField('accountName', event.target.value)} placeholder="Tên kết nối" />
                <select className="portal-field" value={form.status} onChange={(event) => updateField('status', event.target.value)}><option value="ACTIVE">Đang hoạt động</option><option value="PAUSED">Tạm dừng</option><option value="PENDING">Chưa kiểm tra</option><option value="ERROR">Đang lỗi</option></select>
                <input className="portal-field" value={form.appId} onChange={(event) => updateField('appId', event.target.value)} placeholder="APP_ID" />
                <input type="password" className="portal-field" value={form.appSecret} onChange={(event) => updateField('appSecret', event.target.value)} placeholder={mode === 'edit' ? 'APP_SECRET mới (nếu đổi)' : 'APP_SECRET'} />
                <input className="portal-field" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="Email tài khoản Deye" />
                <input type="password" className="portal-field" value={form.password} onChange={(event) => updateField('password', event.target.value)} placeholder={mode === 'edit' ? 'Password mới (nếu đổi)' : 'Password tài khoản Deye'} />
              </div>
              <input className="portal-field" value={form.baseUrl} onChange={(event) => updateField('baseUrl', event.target.value)} placeholder="https://eu1-developer.deyecloud.com" />
              {selectedConnection ? <div className="grid gap-3 md:grid-cols-3"><div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Company</p><p className="mt-2 text-lg font-semibold text-white">{selectedConnection.companyName || 'Chưa xác minh'}</p></div><div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Role</p><p className="mt-2 text-lg font-semibold text-white">{selectedConnection.roleName || '-'}</p></div><div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Token</p><p className="mt-2 break-all text-lg font-semibold text-white">{selectedConnection.accessTokenPreview || 'Chưa cấp'}</p></div></div> : null}
              {message ? <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
              {error ? <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : mode === 'create' ? 'Tạo kết nối' : 'Lưu thay đổi'}</button>
                {selectedConnection ? <button type="button" className="btn-ghost" onClick={() => void runAction('test')} disabled={working === 'test'}>{working === 'test' ? 'Đang test...' : 'Test connection'}</button> : null}
                {selectedConnection ? <button type="button" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15" onClick={() => void handleDelete()}><Trash2 className="h-4 w-4" />Xóa kết nối</button> : null}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Đồng bộ Deye" eyebrow="Station, device, monthly PV generation và billing" dark>
            {selectedConnection ? (
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <input type="number" min="2020" max="2100" className="portal-field" value={year} onChange={(event) => setYear(event.target.value)} placeholder="Năm sync" />
                  <input className="portal-field" value={startAt} onChange={(event) => setStartAt(event.target.value)} placeholder="YYYY-MM" />
                  <input className="portal-field" value={endAt} onChange={(event) => setEndAt(event.target.value)} placeholder="YYYY-MM" />
                </div>
                <label className="inline-flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={includeStationSync} onChange={(event) => setIncludeStationSync(event.target.checked)} /> Sync station/device trước khi lấy lịch sử PV tháng</label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-ghost" onClick={() => void runAction('stations')} disabled={working === 'stations'}><DatabaseZap className="h-4 w-4" />{working === 'stations' ? 'Đang sync station...' : 'Sync station + device'}</button>
                  <button type="button" className="btn-ghost" onClick={() => void runAction('monthly')} disabled={working === 'monthly'}><Zap className="h-4 w-4" />{working === 'monthly' ? 'Đang sync PV tháng...' : 'Sync monthly history'}</button>
                  <button type="button" className="btn-primary" onClick={() => void runAction('all')} disabled={working === 'all'}><RefreshCw className="h-4 w-4" />{working === 'all' ? 'Đang sync all...' : 'Sync now'}</button>
                </div>
              </div>
            ) : <div className="portal-card-soft p-5 text-sm text-slate-300">Tạo hoặc chọn một kết nối Deye để bắt đầu sync dữ liệu thật.</div>}
          </SectionCard>
        </div>
      </div>

      {selectedConnection ? (
        <>
          <SectionCard title="Station và billing đã đồng bộ" eyebrow="Hệ thống, device và PV tháng" dark>
            {selectedConnection.systems?.length ? <div className="grid gap-4 xl:grid-cols-2">{selectedConnection.systems.map((system) => <div key={system.id} className="portal-card-soft p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{system.stationId || 'Chưa có station id'}</p><h3 className="mt-2 text-lg font-semibold text-white">{system.stationName || system.name}</h3><p className="mt-1 text-sm text-slate-400">{system.customer?.companyName || system.customer?.user?.fullName || 'Chưa map customer'}</p></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{formatNumber(system.devices?.length || 0)} devices</span></div><div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2"><p>Công suất: {formatNumber(system.installedCapacityKwp || system.capacityKwp, 'kWp')}</p><p>Timezone: {system.timeZone || '-'}</p><p>PV tháng hiện tại: {formatNumber(system.currentMonthGenerationKwh || 0, 'kWh')}</p><p>PV năm hiện tại: {formatNumber(system.currentYearGenerationKwh || 0, 'kWh')}</p><p>Tổng generation: {formatNumber(system.totalGenerationKwh || 0, 'kWh')}</p><p>Giá mặc định: {formatCurrency(system.defaultUnitPrice || 0)}</p></div></div>)}</div> : <div className="portal-card-soft p-5 text-sm text-slate-300">Chưa có station nào được đồng bộ vào hệ thống. Hãy bấm "Sync station + device".</div>}
          </SectionCard>

          <SectionCard title="Sync logs" eyebrow="Nhật ký token, station sync và monthly history" dark>
            {logs.length ? <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-sm text-slate-300"><thead><tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500"><th className="pb-3 pr-4 font-medium">Loại</th><th className="pb-3 pr-4 font-medium">Trạng thái</th><th className="pb-3 pr-4 font-medium">Station</th><th className="pb-3 pr-4 font-medium">Thông điệp</th><th className="pb-3 pr-4 font-medium">Bắt đầu</th><th className="pb-3 font-medium">Kết thúc</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-white/6 align-top last:border-none"><td className="py-4 pr-4 font-medium text-white">{log.syncType}</td><td className="py-4 pr-4"><span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-semibold', statusBadge(log.status))}>{log.status}</span></td><td className="py-4 pr-4">{log.targetStationId || '-'}</td><td className="py-4 pr-4"><div className="max-w-[360px] text-sm leading-6 text-slate-300">{log.message || '-'}</div></td><td className="py-4 pr-4 whitespace-nowrap">{formatDateTime(log.startedAt)}</td><td className="py-4 whitespace-nowrap">{log.finishedAt ? formatDateTime(log.finishedAt) : '-'}</td></tr>)}</tbody></table></div> : <div className="portal-card-soft p-5 text-sm text-slate-300">Chưa có sync log nào cho kết nối Deye này.</div>}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
