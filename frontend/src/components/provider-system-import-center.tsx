'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  UserPlus,
  X,
} from 'lucide-react';
import {
  assignSystemCustomerRequest,
  createCustomerRequest,
  discoverProviderPlantsRequest,
  importProviderPlantsRequest,
  linkImportedSystemRequest,
  listProviderDiscoveryConnectionsRequest,
} from '@/lib/api';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  AdminSystemRecord,
  CustomerRecord,
  DiscoveredProviderPlant,
  ProviderDiscoveryBootstrap,
  ProviderDiscoveryProvider,
  ProviderPlantDiscoveryResponse,
} from '@/types';

const providerLabels: Record<ProviderDiscoveryProvider, string> = {
  DEYE: 'Deye OpenAPI',
  SOLARMAN: 'EcoPower / SOLARMAN',
  LUXPOWER: 'LuxPower',
  SEMS_PORTAL: 'GoodWe SEMS+',
};

const importStateLabels: Record<DiscoveredProviderPlant['importState'], string> = {
  NEW: 'Mới',
  IMPORTED_UNASSIGNED: 'Đã nhập, chưa gán',
  ASSIGNED: 'Đã gán khách hàng',
  ALREADY_LINKED: 'Đã liên kết',
  CONFLICT: 'Xung đột',
  SYNC_ERROR: 'Lỗi đồng bộ',
  DISCONNECTED: 'Đã ngắt kết nối',
};

type ImportCenterProps = {
  onChanged: () => Promise<void> | void;
  onStartManual: () => void;
};

export function ProviderSystemImportCenter({ onChanged, onStartManual }: ImportCenterProps) {
  const [open, setOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<ProviderDiscoveryBootstrap | null>(null);
  const [provider, setProvider] = useState<ProviderDiscoveryProvider>('DEYE');
  const [connectionId, setConnectionId] = useState('');
  const [discovery, setDiscovery] = useState<ProviderPlantDiscoveryResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const capability = bootstrap?.capabilities.find((item) => item.provider === provider) || null;
  const connections = useMemo(
    () => bootstrap?.connections.filter((item) => item.provider === provider) || [],
    [bootstrap, provider],
  );

  useEffect(() => {
    if (!open || bootstrap) return;
    setLoading(true);
    listProviderDiscoveryConnectionsRequest()
      .then((result) => {
        setBootstrap(result);
        const firstAvailable = result.capabilities.find(
          (item) => item.discovery === 'AVAILABLE' &&
            result.connections.some((connection) => connection.provider === item.provider),
        );
        if (firstAvailable) setProvider(firstAvailable.provider);
      })
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : 'Không thể tải kết nối inverter.'),
      )
      .finally(() => setLoading(false));
  }, [bootstrap, open]);

  useEffect(() => {
    setConnectionId(connections[0]?.id || '');
    setDiscovery(null);
    setSelected([]);
    setMessage('');
    setError('');
  }, [connections]);

  async function discover() {
    if (!connectionId) {
      setError('Hãy chọn một tài khoản inverter đã lưu.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await discoverProviderPlantsRequest({ provider, connectionId });
      setDiscovery(result);
      setSelected(
        result.plants
          .filter((plant) => plant.importState === 'NEW' || plant.importState === 'IMPORTED_UNASSIGNED')
          .map((plant) => plant.externalPlantId),
      );
      setMessage(`Đã phát hiện ${result.plants.length} plant/station từ tài khoản.`);
    } catch (nextError) {
      setDiscovery(null);
      setError(nextError instanceof Error ? nextError.message : 'Không thể khám phá plant/station.');
    } finally {
      setLoading(false);
    }
  }

  async function importSelected() {
    if (!selected.length) {
      setError('Hãy chọn ít nhất một plant/station để nhập.');
      return;
    }
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const result = await importProviderPlantsRequest({
        provider,
        connectionId,
        externalPlantIds: selected,
      });
      setMessage(
        `Đã upsert ${result.imported} hệ thống. ${result.disconnected ? `${result.disconnected} hệ thống được đánh dấu ngắt kết nối.` : ''}`,
      );
      await onChanged();
      await discover();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể nhập hệ thống đã chọn.');
    } finally {
      setImporting(false);
    }
  }

  function togglePlant(plantId: string) {
    setSelected((current) =>
      current.includes(plantId)
        ? current.filter((item) => item !== plantId)
        : [...current, plantId],
    );
  }

  return (
    <>
      <div className="portal-card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">System import center</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Đồng bộ hệ thống từ tài khoản inverter
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Chọn một kết nối đã lưu, khám phá toàn bộ plant/station rồi nhập vào Moka Solar. Hệ thống mới có thể để chưa gán khách hàng.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <CloudDownload className="h-4 w-4" />
              Đồng bộ từ tài khoản inverter
            </button>
            <button type="button" className="btn-ghost" onClick={onStartManual}>
              <Plus className="h-4 w-4" />
              Tạo thủ công
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] border border-white/10 bg-[#0b1423] shadow-2xl sm:max-w-5xl sm:rounded-[30px]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b1423]/95 px-5 py-5 backdrop-blur sm:px-7">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Import workflow</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Khám phá plant/station</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-slate-200 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 p-5 sm:p-7">
              <div className="grid gap-3 md:grid-cols-4">
                {(bootstrap?.capabilities || []).map((item) => {
                  const availableConnections = bootstrap?.connections.filter(
                    (connection) => connection.provider === item.provider,
                  ).length || 0;
                  const active = provider === item.provider;
                  return (
                    <button
                      key={item.provider}
                      type="button"
                      onClick={() => setProvider(item.provider)}
                      className={cn(
                        'rounded-[22px] border p-4 text-left transition',
                        active
                          ? 'border-cyan-300/50 bg-cyan-300/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]',
                      )}
                    >
                      <p className="font-semibold">{providerLabels[item.provider]}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {item.discovery === 'AVAILABLE'
                          ? `${availableConnections} kết nối đã lưu`
                          : 'Chưa đủ request đã kiểm chứng'}
                      </p>
                    </button>
                  );
                })}
              </div>

              {loading && !bootstrap ? (
                <div className="flex items-center gap-3 rounded-[20px] border border-white/10 p-5 text-slate-300">
                  <LoaderCircle className="h-5 w-5 animate-spin" /> Đang tải kết nối...
                </div>
              ) : null}

              {capability ? (
                <div
                  className={cn(
                    'rounded-[20px] border px-4 py-4 text-sm leading-6',
                    capability.discovery === 'AVAILABLE'
                      ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-100'
                      : 'border-amber-300/20 bg-amber-300/8 text-amber-100',
                  )}
                >
                  <p className="font-semibold">
                    {capability.discovery === 'AVAILABLE' ? 'Sẵn sàng khám phá' : 'Chưa hỗ trợ discovery'}
                  </p>
                  <p className="mt-1">{capability.message}</p>
                  {capability.missingRequirements?.length ? (
                    <p className="mt-2 text-xs opacity-80">
                      Cần bổ sung: {capability.missingRequirements.join(' • ')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Tài khoản inverter đã lưu</span>
                  <select
                    className="portal-field"
                    value={connectionId}
                    onChange={(event) => setConnectionId(event.target.value)}
                    disabled={capability?.discovery !== 'AVAILABLE'}
                  >
                    <option value="">Chọn kết nối</option>
                    {connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.name} · {connection.status}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading || !connectionId || capability?.discovery !== 'AVAILABLE'}
                  onClick={() => void discover()}
                >
                  {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Kiểm tra và khám phá
                </button>
              </div>

              {discovery ? (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-300">
                      {discovery.plants.length} plant/station · {selected.length} đã chọn
                    </p>
                    <button
                      type="button"
                      className="text-sm font-semibold text-cyan-300"
                      onClick={() =>
                        setSelected(
                          discovery.plants
                            .filter((plant) => plant.importState !== 'CONFLICT')
                            .map((plant) => plant.externalPlantId),
                        )
                      }
                    >
                      Chọn tất cả không xung đột
                    </button>
                  </div>
                  {discovery.plants.map((plant) => {
                    const checked = selected.includes(plant.externalPlantId);
                    const conflict = plant.importState === 'CONFLICT';
                    return (
                      <label
                        key={plant.externalPlantId}
                        className={cn(
                          'grid cursor-pointer gap-3 rounded-[22px] border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
                          checked ? 'border-cyan-300/40 bg-cyan-300/8' : 'border-white/10 bg-white/[0.03]',
                          conflict && 'cursor-not-allowed border-rose-300/20 bg-rose-300/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 accent-cyan-300"
                          checked={checked}
                          disabled={conflict}
                          onChange={() => togglePlant(plant.externalPlantId)}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {plant.externalPlantName || plant.externalPlantId}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-400">{plant.externalPlantId}</p>
                          <div className="mt-3 grid gap-1 text-sm text-slate-300 sm:grid-cols-3">
                            <span>
                              {typeof plant.installedCapacityKwp === 'number'
                                ? formatNumber(plant.installedCapacityKwp, 'kWp')
                                : 'Chưa có công suất'}
                            </span>
                            <span>{plant.devices.length} thiết bị</span>
                            <span>{plant.status || 'Chưa có trạng thái'}</span>
                          </div>
                        </div>
                        <span className="h-fit rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
                          {importStateLabels[plant.importState]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-[18px] border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Bỏ qua
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={importing || !selected.length}
                  onClick={() => void importSelected()}
                >
                  {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                  Nhập {selected.length ? `${selected.length} hệ thống` : 'đã chọn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type BindingActionsProps = {
  system: AdminSystemRecord;
  systems: AdminSystemRecord[];
  customers: CustomerRecord[];
  onChanged: () => Promise<void> | void;
  onView: () => void;
};

export function ProviderSystemBindingActions({
  system,
  systems,
  customers,
  onChanged,
  onView,
}: BindingActionsProps) {
  const [dialog, setDialog] = useState<'assign' | 'link' | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [targetSystemId, setTargetSystemId] = useState('');
  const [quickCreate, setQuickCreate] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imported = Boolean(system.sourceSystem && system.sourceSystem !== 'MANUAL');
  const manualTargets = systems.filter(
    (candidate) =>
      candidate.id !== system.id &&
      (!candidate.sourceSystem || candidate.sourceSystem === 'MANUAL'),
  );

  async function assign() {
    setSaving(true);
    setError('');
    try {
      let nextCustomerId = customerId;
      if (quickCreate) {
        if (!customerForm.fullName.trim() || !customerForm.email.trim()) {
          throw new Error('Tên và email là bắt buộc khi tạo khách hàng mới.');
        }
        const created = await createCustomerRequest({
          fullName: customerForm.fullName.trim(),
          companyName: customerForm.companyName.trim() || undefined,
          email: customerForm.email.trim(),
          phone: customerForm.phone.trim() || undefined,
        });
        nextCustomerId = created.id;
      }
      if (!nextCustomerId) throw new Error('Hãy chọn khách hàng cần gán.');
      await assignSystemCustomerRequest(system.id, nextCustomerId);
      await onChanged();
      setDialog(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể gán khách hàng.');
    } finally {
      setSaving(false);
    }
  }

  async function link() {
    if (!targetSystemId) {
      setError('Hãy chọn hệ thống thủ công cần liên kết.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await linkImportedSystemRequest(system.id, targetSystemId);
      await onChanged();
      setDialog(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể liên kết hệ thống.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {imported ? (
          <button type="button" className="btn-ghost min-h-10 px-3 py-2 text-xs" onClick={() => setDialog('assign')}>
            <UserPlus className="h-3.5 w-3.5" /> {system.customer ? 'Đổi khách hàng' : 'Gán khách hàng'}
          </button>
        ) : null}
        {imported && manualTargets.length ? (
          <button type="button" className="btn-ghost min-h-10 px-3 py-2 text-xs" onClick={() => setDialog('link')}>
            <Link2 className="h-3.5 w-3.5" /> Liên kết hệ thống có sẵn
          </button>
        ) : null}
        <button type="button" className="btn-ghost min-h-10 px-3 py-2 text-xs" onClick={onView}>
          Xem dữ liệu
        </button>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/75 p-0 sm:items-center sm:p-5">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0b1423] p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  {system.systemCode}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {dialog === 'assign' ? 'Gán khách hàng' : 'Liên kết với hệ thống có sẵn'}
                </h3>
              </div>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-white" onClick={() => setDialog(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {dialog === 'assign' ? (
              <div className="mt-5 grid gap-4">
                <div className="flex gap-2 rounded-full border border-white/10 p-1">
                  <button type="button" className={cn('flex-1 rounded-full px-4 py-2 text-sm', !quickCreate ? 'bg-white text-slate-950' : 'text-slate-300')} onClick={() => setQuickCreate(false)}>
                    Chọn khách hàng
                  </button>
                  <button type="button" className={cn('flex-1 rounded-full px-4 py-2 text-sm', quickCreate ? 'bg-white text-slate-950' : 'text-slate-300')} onClick={() => setQuickCreate(true)}>
                    Tạo khách hàng mới
                  </button>
                </div>
                {quickCreate ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="portal-field" placeholder="Họ tên *" value={customerForm.fullName} onChange={(event) => setCustomerForm((current) => ({ ...current, fullName: event.target.value }))} />
                    <input className="portal-field" placeholder="Tên công ty" value={customerForm.companyName} onChange={(event) => setCustomerForm((current) => ({ ...current, companyName: event.target.value }))} />
                    <input className="portal-field" type="email" placeholder="Email *" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
                    <input className="portal-field" placeholder="Số điện thoại" value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} />
                  </div>
                ) : (
                  <select className="portal-field" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                    <option value="">Chọn khách hàng</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.companyName || customer.user.fullName} · {customer.customerCode}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn-primary" disabled={saving} onClick={() => void assign()}>
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Lưu gán khách hàng
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <p className="text-sm leading-6 text-slate-300">
                  Moka Solar sẽ giữ nguyên khách hàng, hợp đồng, giá, VAT và ghi chú của hệ thống đích. Nếu lịch sử bị xung đột, toàn bộ transaction sẽ dừng.
                </p>
                <select className="portal-field" value={targetSystemId} onChange={(event) => setTargetSystemId(event.target.value)}>
                  <option value="">Chọn hệ thống thủ công</option>
                  {manualTargets.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.systemCode}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-primary" disabled={saving} onClick={() => void link()}>
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Liên kết an toàn
                </button>
              </div>
            )}
            {error ? <div className="mt-4 rounded-[18px] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
            <p className="mt-5 text-xs text-slate-500">
              Đồng bộ gần nhất: {system.lastSuccessfulSyncAt ? formatDateTime(system.lastSuccessfulSyncAt) : 'Chưa có'}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
