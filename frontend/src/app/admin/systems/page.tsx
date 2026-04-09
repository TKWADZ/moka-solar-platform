'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';
import { MonthlyPvBillingTable } from '@/components/monthly-pv-billing-table';
import { SectionCard } from '@/components/section-card';
import { useSystemDashboardPresence } from '@/hooks/use-system-dashboard-presence';
import {
  createSystemRequest,
  deleteMonthlyPvBillingRequest,
  deleteSystemRequest,
  downloadInvoicePdfRequest,
  generateMonthlyPvBillingInvoiceRequest,
  listDeyeConnectionsRequest,
  listAdminSystemsRequest,
  listCustomersRequest,
  listMonthlyPvBillingsRequest,
  previewDeyeSystemStationsRequest,
  previewSemsRequest,
  previewSolarmanRequest,
  syncDeyeSystemStationRequest,
  syncMonthlyPvBillingRequest,
  syncSemsRequest,
  syncSolarmanRequest,
  updateMonthlyPvBillingRequest,
  updateSystemRequest,
} from '@/lib/api';
import {
  cn,
  formatCurrency,
  formatDateTime,
  formatMonthPeriod,
  formatNumber,
} from '@/lib/utils';
import {
  AdminSystemRecord,
  CustomerRecord,
  DeyeConnectionRecord,
  DeyeStationPreviewRecord,
  MonitorSnapshot,
  MonitoringProvider,
  MonthlyPvBillingRecord,
} from '@/types';

type SystemFormState = {
  customerId: string;
  systemCode: string;
  name: string;
  systemType: string;
  capacityKwp: string;
  panelCount: string;
  panelBrand: string;
  panelModel: string;
  inverterBrand: string;
  inverterModel: string;
  monitoringProvider: MonitoringProvider;
  monitoringPlantId: string;
  defaultUnitPrice: string;
  defaultTaxAmount: string;
  defaultDiscountAmount: string;
  installDate: string;
  location: string;
  notes: string;
  status: string;
};

type MonthlyFormState = {
  month: string;
  year: string;
  pvGenerationKwh: string;
  unitPrice: string;
  taxRate: string;
  discountAmount: string;
  note: string;
  source: string;
};

type SystemFieldErrors = Partial<Record<keyof SystemFormState, string>>;
type MonthlyFieldErrors = Partial<Record<keyof MonthlyFormState, string>>;

const providerOptions = [
  {
    value: 'SEMS_PORTAL' as const,
    label: 'SEMS Portal',
    description: 'Cho hệ thống GoodWe và tài khoản SEMS hiện hữu.',
  },
  {
    value: 'SOLARMAN' as const,
    label: 'EcoPower / SOLARMAN',
    description: 'Cho hệ thống EcoPower hoặc bundle SOLARMAN.',
  },
];

const deyeProviderOption = {
  value: 'DEYE' as const,
  label: 'Deye OpenAPI',
  description: 'Chọn Deye connection, xem trước station và gán vào hệ thống hiện tại.',
};

const systemStatusOptions = [
  { value: 'PLANNING', label: 'Lên kế hoạch' },
  { value: 'INSTALLING', label: 'Đang lắp đặt' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const monthlySourceOptions = [
  { value: 'ADMIN_SYNC', label: 'Đồng bộ admin' },
  { value: 'MANUAL', label: 'Nhập tay' },
  { value: 'ENERGY_RECORD_AGGREGATE', label: 'Tổng hợp daily record' },
];

function emptyForm(): SystemFormState {
  return {
    customerId: '',
    systemCode: '',
    name: '',
    systemType: 'Áp mái',
    capacityKwp: '',
    panelCount: '',
    panelBrand: '',
    panelModel: '',
    inverterBrand: '',
    inverterModel: '',
    monitoringProvider: 'SEMS_PORTAL',
    monitoringPlantId: '',
    defaultUnitPrice: '',
    defaultTaxAmount: '',
    defaultDiscountAmount: '',
    installDate: '',
    location: '',
    notes: '',
    status: 'ACTIVE',
  };
}

function emptyMonthlyForm(): MonthlyFormState {
  const now = new Date();

  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    pvGenerationKwh: '',
    unitPrice: '',
    taxRate: '',
    discountAmount: '',
    note: '',
    source: 'ADMIN_SYNC',
  };
}

function buildForm(system: AdminSystemRecord | null): SystemFormState {
  if (!system) return emptyForm();
  return {
    customerId: system.customer?.id || '',
    systemCode: system.systemCode || '',
    name: system.name || '',
    systemType: system.systemType || 'Áp mái',
    capacityKwp: String(system.capacityKwp ?? ''),
    panelCount: String(system.panelCount ?? ''),
    panelBrand: system.panelBrand || '',
    panelModel: system.panelModel || '',
    inverterBrand: system.inverterBrand || '',
    inverterModel: system.inverterModel || '',
    monitoringProvider:
      system.monitoringProvider === 'SOLARMAN'
        ? 'SOLARMAN'
        : system.monitoringProvider === 'DEYE'
          ? 'DEYE'
          : 'SEMS_PORTAL',
    monitoringPlantId: system.monitoringPlantId || '',
    defaultUnitPrice:
      system.defaultUnitPrice !== null && system.defaultUnitPrice !== undefined
        ? String(system.defaultUnitPrice)
        : '',
    defaultTaxAmount:
      system.defaultTaxAmount !== null && system.defaultTaxAmount !== undefined
        ? String(system.defaultTaxAmount)
        : '',
    defaultDiscountAmount:
      system.defaultDiscountAmount !== null && system.defaultDiscountAmount !== undefined
        ? String(system.defaultDiscountAmount)
        : '',
    installDate: system.installDate ? system.installDate.slice(0, 10) : '',
    location: system.location || '',
    notes: system.notes || '',
    status: system.status || 'ACTIVE',
  };
}

function buildMonthlyForm(record?: MonthlyPvBillingRecord | null): MonthlyFormState {
  if (!record) {
    return emptyMonthlyForm();
  }

  const taxRate =
    record.subtotalAmount > 0 && record.taxAmount > 0
      ? ((record.taxAmount / record.subtotalAmount) * 100).toFixed(2)
      : '';

  return {
    month: String(record.month),
    year: String(record.year),
    pvGenerationKwh: String(record.pvGenerationKwh),
    unitPrice: String(record.unitPrice),
    taxRate,
    discountAmount: record.discountAmount ? String(record.discountAmount) : '',
    note: record.note || '',
    source: record.source || 'ADMIN_SYNC',
  };
}

function validateForm(form: SystemFormState) {
  const errors: SystemFieldErrors = {};
  if (!form.customerId) errors.customerId = 'Vui lòng chọn khách hàng liên kết.';
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên hệ thống.';
  if (!form.capacityKwp.trim() || Number(form.capacityKwp) <= 0) {
    errors.capacityKwp = 'Công suất phải lớn hơn 0.';
  }
  if (form.panelCount.trim() && Number(form.panelCount) < 0) {
    errors.panelCount = 'Số lượng tấm pin không hợp lệ.';
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

function validateMonthlyForm(form: MonthlyFormState) {
  const errors: MonthlyFieldErrors = {};
  const month = Number(form.month);
  const year = Number(form.year);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    errors.month = 'Tháng phải nằm trong khoảng 1-12.';
  }

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    errors.year = 'Năm chưa hợp lệ.';
  }

  if (form.pvGenerationKwh.trim() && Number(form.pvGenerationKwh) <= 0) {
    errors.pvGenerationKwh = 'Sản lượng PV phải lớn hơn 0.';
  }

  if (form.unitPrice.trim() && Number(form.unitPrice) <= 0) {
    errors.unitPrice = 'Đơn giá phải lớn hơn 0.';
  }

  if (form.taxRate.trim() && Number(form.taxRate) < 0) {
    errors.taxRate = 'Thuế suất không hợp lệ.';
  }

  if (form.discountAmount.trim() && Number(form.discountAmount) < 0) {
    errors.discountAmount = 'Chiết khấu không hợp lệ.';
  }

  return errors;
}

function providerLabel(value?: string | null) {
  if (value === 'SOLARMAN') return 'EcoPower / SOLARMAN';
  if (value === 'DEYE') return 'Deye OpenAPI';
  return 'SEMS Portal';
}

function monitorIdLabel(provider: MonitoringProvider) {
  return provider === 'SOLARMAN' || provider === 'DEYE' ? 'Station ID' : 'Plant ID';
}

function sourceLabel(value?: string | null) {
  if (value === 'DEYE') return 'Deye OpenAPI';
  if (value === 'SOLARMAN') return 'EcoPower / SOLARMAN';
  if (value === 'LUXPOWER') return 'LuxPower';
  if (value === 'SEMS_PORTAL') return 'SEMS Portal';
  return value || 'Nội bộ / thủ công';
}

function syncStatusLabel(system: AdminSystemRecord | null) {
  if (!system) return 'Chưa cấu hình';
  if (!system.monitorBindingReady) return 'Chưa cấu hình kết nối';
  if (system.lastSyncStatus === 'ERROR') return 'Đang lỗi / backoff';
  if (system.lastSyncStatus === 'RUNNING') return 'Đang đồng bộ';
  if (system.lastSuccessfulSyncAt) return 'Đang tự động đồng bộ';
  return 'Chờ nhịp đầu tiên';
}

function asSnapshot(value: MonitorSnapshot | Record<string, unknown> | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MonitorSnapshot)
    : null;
}

function metric(value?: number | null, unit?: string) {
  return typeof value === 'number' ? formatNumber(value, unit) : 'Chưa có dữ liệu';
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

export default function AdminSystemsPage() {
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyPvBillingRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<SystemFormState>(emptyForm());
  const [monthlyForm, setMonthlyForm] = useState<MonthlyFormState>(emptyMonthlyForm());
  const [editingMonthlyId, setEditingMonthlyId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SystemFieldErrors>({});
  const [monthlyFieldErrors, setMonthlyFieldErrors] = useState<MonthlyFieldErrors>({});
  const [preview, setPreview] = useState<MonitorSnapshot | null>(null);
  const [deyeConnections, setDeyeConnections] = useState<DeyeConnectionRecord[]>([]);
  const [selectedDeyeConnectionId, setSelectedDeyeConnectionId] = useState('');
  const [deyePreviewStations, setDeyePreviewStations] = useState<DeyeStationPreviewRecord[]>([]);
  const [selectedDeyeStationId, setSelectedDeyeStationId] = useState('');
  const [showDeyeConfig, setShowDeyeConfig] = useState(false);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deyePreviewing, setDeyePreviewing] = useState(false);
  const [deyeSyncing, setDeyeSyncing] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlySaving, setMonthlySaving] = useState(false);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState('');
  const [deletingMonthlyId, setDeletingMonthlyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [monthlyMessage, setMonthlyMessage] = useState('');
  const [monthlyError, setMonthlyError] = useState('');

  useSystemDashboardPresence(selectedId ? [selectedId] : [], 'admin-systems');

  const selectedSystem = useMemo(
    () => systems.find((item) => item.id === selectedId) || null,
    [systems, selectedId],
  );

  const selectedDeyeStation = useMemo(
    () => deyePreviewStations.find((item) => item.stationId === selectedDeyeStationId) || null,
    [deyePreviewStations, selectedDeyeStationId],
  );

  const filteredSystems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return systems;
    return systems.filter((system) =>
      [
        system.systemCode,
        system.name,
        system.stationName,
        system.sourceSystem,
        system.systemType,
        system.location,
        system.customer?.companyName,
        system.customer?.user?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [systems, search]);

  const monthlySummary = useMemo(() => {
    const totalPv = monthlyRecords.reduce((sum, record) => sum + record.pvGenerationKwh, 0);
    const totalAmount = monthlyRecords.reduce((sum, record) => sum + record.totalAmount, 0);
    const latestSync = monthlyRecords[0]?.syncTime || null;

    return {
      totalPv,
      totalAmount,
      latestSync,
      invoiced: monthlyRecords.filter((record) => record.invoiceId).length,
    };
  }, [monthlyRecords]);

  async function loadData(nextSelectedId?: string) {
    const [nextSystems, nextCustomers, nextDeyeConnections] = await Promise.all([
      listAdminSystemsRequest(),
      listCustomersRequest(),
      listDeyeConnectionsRequest(),
    ]);
    setSystems(nextSystems);
    setCustomers(nextCustomers);
    setDeyeConnections(nextDeyeConnections);
    setSelectedDeyeConnectionId((current) =>
      current && nextDeyeConnections.some((item) => item.id === current)
        ? current
        : nextDeyeConnections[0]?.id || '',
    );
    const targetId = nextSelectedId || nextSystems[0]?.id || '';
    setSelectedId(targetId);
    if (mode === 'edit') {
      const current = nextSystems.find((item) => item.id === targetId) || null;
      setForm(buildForm(current));
      setPreview(asSnapshot(current?.latestMonitorSnapshot));
    }
  }

  async function loadMonthlyRecords(systemId: string) {
    setMonthlyLoading(true);
    try {
      const records = await listMonthlyPvBillingsRequest({ systemId });
      setMonthlyRecords(records);
      setMonthlyError('');
    } catch (nextError) {
      setMonthlyError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải lịch sử sản lượng PV theo tháng.',
      );
      setMonthlyRecords([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) =>
        setError(
          nextError instanceof Error ? nextError.message : 'Không thể tải danh mục hệ thống.',
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildForm(selectedSystem));
      setPreview(asSnapshot(selectedSystem?.latestMonitorSnapshot));
      setSelectedDeyeConnectionId((current) =>
        selectedSystem?.deyeConnectionId || current,
      );
      setSelectedDeyeStationId(selectedSystem?.sourceSystem === 'DEYE' ? selectedSystem.stationId || '' : '');
      setDeyePreviewStations([]);
      setFieldErrors({});
    }
  }, [mode, selectedSystem]);

  useEffect(() => {
    if (form.monitoringProvider === 'DEYE') {
      setShowDeyeConfig(true);
    }
  }, [form.monitoringProvider]);

  useEffect(() => {
    if (mode !== 'edit' || !selectedSystem) {
      setMonthlyRecords([]);
      setMonthlyForm(emptyMonthlyForm());
      setEditingMonthlyId('');
      setMonthlyFieldErrors({});
      setMonthlyMessage('');
      setMonthlyError('');
      return;
    }

    setMonthlyForm(emptyMonthlyForm());
    setEditingMonthlyId('');
    setMonthlyFieldErrors({});
    void loadMonthlyRecords(selectedSystem.id);
  }, [mode, selectedSystem?.id]);

  function updateField<K extends keyof SystemFormState>(key: K, value: SystemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateMonthlyField<K extends keyof MonthlyFormState>(
    key: K,
    value: MonthlyFormState[K],
  ) {
    setMonthlyForm((current) => ({ ...current, [key]: value }));
    setMonthlyFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function startCreate() {
    setMode('create');
    setSelectedId('');
    setForm(emptyForm());
    setPreview(null);
    setDeyePreviewStations([]);
    setSelectedDeyeStationId('');
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  function startEdit(id: string) {
    setMode('edit');
    setSelectedId(id);
    setDeyePreviewStations([]);
    setSelectedDeyeStationId('');
    setMessage('');
    setError('');
  }

  function startEditMonthly(record: MonthlyPvBillingRecord) {
    setEditingMonthlyId(record.id);
    setMonthlyForm(buildMonthlyForm(record));
    setMonthlyFieldErrors({});
    setMonthlyMessage('');
    setMonthlyError('');
  }

  function resetMonthlyEditor() {
    setEditingMonthlyId('');
    setMonthlyForm(emptyMonthlyForm());
    setMonthlyFieldErrors({});
    setMonthlyMessage('');
    setMonthlyError('');
  }

  async function refreshData() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await loadData(selectedId);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể tải lại danh mục hệ thống.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    const nextErrors = validateForm(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Vui lòng kiểm tra lại các trường đang được đánh dấu.');
      return;
    }

    setSaving(true);
    const payload = {
      customerId: form.customerId,
      ...(form.systemCode.trim() ? { systemCode: form.systemCode.trim() } : {}),
      name: form.name.trim(),
      ...(form.systemType.trim() ? { systemType: form.systemType.trim() } : {}),
      capacityKwp: Number(form.capacityKwp),
      panelCount: Number(form.panelCount || 0),
      ...(form.panelBrand.trim() ? { panelBrand: form.panelBrand.trim() } : {}),
      ...(form.panelModel.trim() ? { panelModel: form.panelModel.trim() } : {}),
      ...(form.inverterBrand.trim() ? { inverterBrand: form.inverterBrand.trim() } : {}),
      ...(form.inverterModel.trim() ? { inverterModel: form.inverterModel.trim() } : {}),
      monitoringProvider: form.monitoringProvider,
      ...(form.monitoringPlantId.trim()
        ? { monitoringPlantId: form.monitoringPlantId.trim() }
        : {}),
      ...(form.defaultUnitPrice.trim()
        ? { defaultUnitPrice: Number(form.defaultUnitPrice) }
        : {}),
      ...(form.defaultTaxAmount.trim()
        ? { defaultTaxAmount: Number(form.defaultTaxAmount) }
        : {}),
      ...(form.defaultDiscountAmount.trim()
        ? { defaultDiscountAmount: Number(form.defaultDiscountAmount) }
        : {}),
      ...(form.installDate ? { installDate: new Date(form.installDate).toISOString() } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      status: form.status,
    };

    try {
      if (mode === 'create') {
        const created = await createSystemRequest(payload);
        await loadData(created.id);
        setMode('edit');
        setMessage('Đã tạo hệ thống mới thành công.');
      } else if (selectedSystem) {
        const updated = await updateSystemRequest(selectedSystem.id, payload);
        await loadData(updated.id);
        setMessage('Đã cập nhật thông tin hệ thống.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lưu hệ thống.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedSystem) return;
    if (!window.confirm(`Xóa hệ thống "${selectedSystem.name}"?`)) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteSystemRequest(selectedSystem.id);
      await loadData();
      setMode('edit');
      setMessage('Đã xóa hệ thống khỏi danh mục.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể xóa hệ thống.');
    } finally {
      setSaving(false);
    }
  }

  async function onPreview() {
    if (form.monitoringProvider === 'DEYE') {
      await onPreviewDeyeStations();
      return;
    }

    if (!form.monitoringPlantId.trim()) {
      setError(`${monitorIdLabel(form.monitoringProvider)} là bắt buộc để xem trước dữ liệu.`);
      return;
    }
    setPreviewing(true);
    setMessage('');
    setError('');
    try {
      const snapshot =
        form.monitoringProvider === 'SOLARMAN'
          ? await previewSolarmanRequest({
              stationId: form.monitoringPlantId.trim(),
              baseUrl: baseUrl || undefined,
              appId: appId || undefined,
              appSecret: appSecret || undefined,
              username: username || undefined,
              password: password || undefined,
            })
          : await previewSemsRequest({
              plantId: form.monitoringPlantId.trim(),
              account: account || undefined,
              password: password || undefined,
            });
      setPreview(snapshot);
      setMessage(`Đã tải bản xem trước từ ${providerLabel(form.monitoringProvider)}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể xem trước dữ liệu monitor.',
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function onSyncMonitor() {
    if (form.monitoringProvider === 'DEYE') {
      await onSyncDeyeStation();
      return;
    }

    if (!selectedSystem) {
      setError('Hãy lưu hệ thống trước khi đồng bộ dữ liệu inverter.');
      return;
    }
    if (!form.monitoringPlantId.trim()) {
      setError(`${monitorIdLabel(form.monitoringProvider)} là bắt buộc để đồng bộ.`);
      return;
    }
    setSyncing(true);
    setMessage('');
    setError('');
    try {
      const result =
        form.monitoringProvider === 'SOLARMAN'
          ? await syncSolarmanRequest(selectedSystem.id, {
              stationId: form.monitoringPlantId.trim(),
              baseUrl: baseUrl || undefined,
              appId: appId || undefined,
              appSecret: appSecret || undefined,
              username: username || undefined,
              password: password || undefined,
            })
          : await syncSemsRequest(selectedSystem.id, {
              plantId: form.monitoringPlantId.trim(),
              account: account || undefined,
              password: password || undefined,
            });
      setPreview(result.snapshot);
      await loadData(selectedSystem.id);
      setMessage(`Đã đồng bộ dữ liệu monitor vào hệ thống ${result.systemCode}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể đồng bộ dữ liệu monitor.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function onPreviewDeyeStations() {
    if (!selectedSystem) {
      setError('Hãy lưu hệ thống trước khi xem trước station Deye.');
      return;
    }

    if (!selectedDeyeConnectionId) {
      setError('Hãy chọn một Deye connection trước.');
      return;
    }

    setDeyePreviewing(true);
    setMessage('');
    setError('');

    try {
      const result = await previewDeyeSystemStationsRequest(selectedSystem.id, {
        connectionId: selectedDeyeConnectionId,
      });
      setDeyePreviewStations(result.stations);
      setSelectedDeyeStationId((current) => {
        if (current && result.stations.some((station) => station.stationId === current)) {
          return current;
        }

        const preferred =
          result.stations.find((station) => station.stationId === selectedSystem.stationId) ||
          result.stations.find((station) => !station.linkedSystem || station.linkedSystem.id === selectedSystem.id);

        return preferred?.stationId || result.stations[0]?.stationId || '';
      });
      setMessage(`Đã tải ${result.stations.length} station từ Deye OpenAPI.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể xem trước station Deye.',
      );
    } finally {
      setDeyePreviewing(false);
    }
  }

  async function onSyncDeyeStation() {
    if (!selectedSystem) {
      setError('Hãy lưu hệ thống trước khi đồng bộ Deye vào system.');
      return;
    }

    if (!selectedDeyeConnectionId) {
      setError('Hãy chọn một Deye connection trước.');
      return;
    }

    if (!selectedDeyeStationId) {
      setError('Hãy chọn một station Deye để gán vào system này.');
      return;
    }

    setDeyeSyncing(true);
    setMessage('');
    setError('');

    try {
      const result = await syncDeyeSystemStationRequest(selectedSystem.id, {
        connectionId: selectedDeyeConnectionId,
        stationId: selectedDeyeStationId,
      });
      setPreview(asSnapshot(result.system.latestMonitorSnapshot));
      await loadData(selectedSystem.id);
      setMessage(
        `Đã đồng bộ station ${result.stationName || result.stationId} vào hệ thống ${result.systemCode}.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể đồng bộ station Deye vào system.',
      );
    } finally {
      setDeyeSyncing(false);
    }
  }

  async function onSubmitMonthly(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSystem) {
      setMonthlyError('Hãy chọn hệ thống trước khi đồng bộ sản lượng PV tháng.');
      return;
    }

    const nextErrors = validateMonthlyForm(monthlyForm);
    setMonthlyFieldErrors(nextErrors);
    setMonthlyMessage('');
    setMonthlyError('');

    if (Object.keys(nextErrors).length) {
      setMonthlyError('Vui lòng kiểm tra lại thông tin kỳ tính tiền.');
      return;
    }

    setMonthlySaving(true);

    const payload = {
      month: Number(monthlyForm.month),
      year: Number(monthlyForm.year),
      ...(toOptionalNumber(monthlyForm.pvGenerationKwh) !== undefined
        ? { pvGenerationKwh: Number(monthlyForm.pvGenerationKwh) }
        : {}),
      ...(toOptionalNumber(monthlyForm.unitPrice) !== undefined
        ? { unitPrice: Number(monthlyForm.unitPrice) }
        : {}),
      ...(toOptionalNumber(monthlyForm.taxRate) !== undefined
        ? { taxRate: Number(monthlyForm.taxRate) }
        : {}),
      ...(toOptionalNumber(monthlyForm.discountAmount) !== undefined
        ? { discountAmount: Number(monthlyForm.discountAmount) }
        : {}),
      ...(monthlyForm.note.trim() ? { note: monthlyForm.note.trim() } : {}),
      ...(monthlyForm.source ? { source: monthlyForm.source } : {}),
    };

    try {
      const record = editingMonthlyId
        ? await updateMonthlyPvBillingRequest(editingMonthlyId, payload)
        : await syncMonthlyPvBillingRequest(selectedSystem.id, payload);

      await loadMonthlyRecords(selectedSystem.id);
      setEditingMonthlyId(record.id);
      setMonthlyForm(buildMonthlyForm(record));
      setMonthlyMessage(
        editingMonthlyId
          ? `Đã cập nhật bản ghi PV tháng ${formatMonthPeriod(record.month, record.year)}.`
          : `Đã đồng bộ kỳ ${formatMonthPeriod(record.month, record.year)} cho hệ thống.`,
      );
    } catch (nextError) {
      setMonthlyError(
        nextError instanceof Error ? nextError.message : 'Không thể lưu bản ghi PV tháng.',
      );
    } finally {
      setMonthlySaving(false);
    }
  }

  async function onDeleteMonthly(record: MonthlyPvBillingRecord) {
    if (!window.confirm(`Xóa bản ghi ${formatMonthPeriod(record.month, record.year)}?`)) {
      return;
    }

    setDeletingMonthlyId(record.id);
    setMonthlyMessage('');
    setMonthlyError('');

    try {
      await deleteMonthlyPvBillingRequest(record.id);
      if (selectedSystem) {
        await loadMonthlyRecords(selectedSystem.id);
      }
      if (editingMonthlyId === record.id) {
        resetMonthlyEditor();
      }
      setMonthlyMessage(`Đã xóa bản ghi kỳ ${formatMonthPeriod(record.month, record.year)}.`);
    } catch (nextError) {
      setMonthlyError(
        nextError instanceof Error ? nextError.message : 'Không thể xóa bản ghi PV tháng.',
      );
    } finally {
      setDeletingMonthlyId('');
    }
  }

  async function onGenerateInvoice(record: MonthlyPvBillingRecord) {
    setInvoiceLoadingId(record.id);
    setMonthlyMessage('');
    setMonthlyError('');

    try {
      const result = await generateMonthlyPvBillingInvoiceRequest(record.id);
      if (selectedSystem) {
        await loadMonthlyRecords(selectedSystem.id);
      }
      setMonthlyMessage(
        `Đã phát hành hóa đơn ${result.invoice.invoiceNumber} cho kỳ ${formatMonthPeriod(record.month, record.year)}.`,
      );
    } catch (nextError) {
      setMonthlyError(
        nextError instanceof Error ? nextError.message : 'Không thể phát hành hóa đơn cho kỳ này.',
      );
    } finally {
      setInvoiceLoadingId('');
    }
  }

  if (loading) {
    return (
      <SectionCard title="Quản lý hệ thống" eyebrow="Danh mục lắp đặt và monitor" dark>
        <p className="text-sm text-slate-300">Đang tải danh mục hệ thống...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Hệ thống đang quản lý</p>
          <p className="mt-3 text-3xl font-semibold text-white">{systems.length}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Đã gắn monitor</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {systems.filter((item) => item.monitoringPlantId).length}
          </p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Có snapshot gần nhất</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {systems.filter((item) => item.latestMonitorAt).length}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SectionCard title="Danh mục hệ thống" eyebrow="Tạo mới, tìm kiếm và chọn hồ sơ" dark>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={startCreate}>
                <Plus className="h-4 w-4" />
                Tạo hệ thống
              </button>
              <button type="button" className="btn-ghost" onClick={() => void refreshData()}>
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </button>
            </div>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Tìm kiếm nhanh</span>
              <input
                className="portal-field"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Mã hệ thống, tên, loại, vị trí..."
              />
            </label>
            <div className="space-y-3">
              {filteredSystems.length ? (
                filteredSystems.map((system) => {
                  const selected = mode === 'edit' && selectedId === system.id;
                  const snapshot = asSnapshot(system.latestMonitorSnapshot);

                  return (
                    <button
                      key={system.id}
                      type="button"
                      onClick={() => startEdit(system.id)}
                      className={cn(
                        'w-full rounded-[24px] border px-4 py-4 text-left transition',
                        selected
                          ? 'border-white/20 bg-white text-slate-950'
                          : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            {system.systemCode}
                          </p>
                          <p className="mt-2 truncate text-lg font-semibold">{system.name}</p>
                          <p
                            className={cn(
                              'mt-1 text-sm',
                              selected ? 'text-slate-600' : 'text-slate-400',
                            )}
                          >
                            {system.customer?.companyName ||
                              system.customer?.user?.fullName ||
                              'Khách hàng chưa gắn'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold',
                            selected
                              ? 'bg-slate-950 text-white'
                              : 'bg-emerald-400/15 text-emerald-300',
                          )}
                        >
                          {system.status}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                          selected ? 'text-slate-700' : 'text-slate-300',
                        )}
                      >
                        <p>Công suất: {formatNumber(system.capacityKwp, 'kWp')}</p>
                        <p>Loại: {system.systemType || 'Chưa phân loại'}</p>
                        <p>Nguồn: {sourceLabel(system.sourceSystem)}</p>
                        <p>Monitor: {providerLabel(system.monitoringProvider)}</p>
                        <p>Station: {system.stationId || 'Chưa gán'}</p>
                        <p>PV hiện tại: {metric(snapshot?.currentPvKw, 'kW')}</p>
                        <p>Thiết bị: {formatNumber(system.devices?.length || 0)}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Không có hệ thống nào khớp với bộ lọc hiện tại.
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title={mode === 'create' ? 'Tạo hệ thống mới' : 'Chỉnh sửa hệ thống'}
            eyebrow={
              mode === 'create'
                ? 'Tạo hồ sơ lắp đặt và cấu hình monitor'
                : 'Cập nhật hồ sơ tài sản và monitor'
            }
            dark
          >
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Khách hàng liên kết</span>
                  <select
                    className={cn('portal-field', fieldErrors.customerId && 'border-rose-300/40')}
                    value={form.customerId}
                    onChange={(event) => updateField('customerId', event.target.value)}
                  >
                    <option value="">Chọn khách hàng</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.companyName || customer.user.fullName} - {customer.customerCode}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.customerId ? (
                    <span className="text-xs text-rose-300">{fieldErrors.customerId}</span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Mã hệ thống</span>
                  <input
                    className="portal-field"
                    value={form.systemCode}
                    onChange={(event) => updateField('systemCode', event.target.value)}
                    placeholder="Để trống nếu muốn hệ thống tự sinh mã"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Tên hệ thống</span>
                  <input
                    className={cn('portal-field', fieldErrors.name && 'border-rose-300/40')}
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                  />
                  {fieldErrors.name ? (
                    <span className="text-xs text-rose-300">{fieldErrors.name}</span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Loại hệ thống</span>
                  <input
                    className="portal-field"
                    value={form.systemType}
                    onChange={(event) => updateField('systemType', event.target.value)}
                    placeholder="Áp mái, hybrid lưu trữ, PPA..."
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Công suất (kWp)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className={cn('portal-field', fieldErrors.capacityKwp && 'border-rose-300/40')}
                    value={form.capacityKwp}
                    onChange={(event) => updateField('capacityKwp', event.target.value)}
                  />
                  {fieldErrors.capacityKwp ? (
                    <span className="text-xs text-rose-300">{fieldErrors.capacityKwp}</span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Số tấm pin</span>
                  <input
                    type="number"
                    min="0"
                    className={cn('portal-field', fieldErrors.panelCount && 'border-rose-300/40')}
                    value={form.panelCount}
                    onChange={(event) => updateField('panelCount', event.target.value)}
                  />
                  {fieldErrors.panelCount ? (
                    <span className="text-xs text-rose-300">{fieldErrors.panelCount}</span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Trạng thái</span>
                  <select
                    className="portal-field"
                    value={form.status}
                    onChange={(event) => updateField('status', event.target.value)}
                  >
                    {systemStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Ngày lắp đặt</span>
                  <input
                    type="date"
                    className="portal-field"
                    value={form.installDate}
                    onChange={(event) => updateField('installDate', event.target.value)}
                  />
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
                    placeholder="Tự áp vào PV tháng nếu không nhập tay"
                  />
                  {fieldErrors.defaultUnitPrice ? (
                    <span className="text-xs text-rose-300">{fieldErrors.defaultUnitPrice}</span>
                  ) : null}
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
                  {fieldErrors.defaultTaxAmount ? (
                    <span className="text-xs text-rose-300">{fieldErrors.defaultTaxAmount}</span>
                  ) : null}
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
                  {fieldErrors.defaultDiscountAmount ? (
                    <span className="text-xs text-rose-300">{fieldErrors.defaultDiscountAmount}</span>
                  ) : null}
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Hãng pin</span>
                  <input className="portal-field" value={form.panelBrand} onChange={(event) => updateField('panelBrand', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Model pin</span>
                  <input className="portal-field" value={form.panelModel} onChange={(event) => updateField('panelModel', event.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Hãng inverter</span>
                  <input className="portal-field" value={form.inverterBrand} onChange={(event) => updateField('inverterBrand', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Model inverter</span>
                  <input className="portal-field" value={form.inverterModel} onChange={(event) => updateField('inverterModel', event.target.value)} />
                </label>
              </div>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Địa chỉ lắp đặt</span>
                <textarea className="portal-field min-h-[96px]" value={form.location} onChange={(event) => updateField('location', event.target.value)} />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Ghi chú nội bộ</span>
                <textarea className="portal-field min-h-[110px]" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Tình trạng thực địa, lịch bảo trì, lưu ý kỹ thuật..." />
              </label>

              {selectedSystem && mode === 'edit' ? (
                <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Mã hệ thống</p>
                    <p className="mt-2 break-words text-lg font-semibold text-white">{selectedSystem.systemCode}</p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Khách hàng</p>
                    <p className="mt-2 text-lg font-semibold text-white">{selectedSystem.customer?.companyName || selectedSystem.customer?.user?.fullName || '-'}</p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Lần đồng bộ gần nhất</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedSystem.latestMonitorAt ? formatDateTime(selectedSystem.latestMonitorAt) : 'Chưa có'}
                    </p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Nguồn dữ liệu</p>
                    <p className="mt-2 text-lg font-semibold text-white">{sourceLabel(selectedSystem.sourceSystem)}</p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Station / Plant ID</p>
                    <p className="mt-2 break-words text-lg font-semibold text-white">{selectedSystem.stationId || selectedSystem.monitoringPlantId || 'Chưa gán'}</p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Thiết bị đã đồng bộ</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatNumber(selectedSystem.devices?.length || 0)}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Auto sync</p>
                    <p className="mt-2 text-lg font-semibold text-white">{syncStatusLabel(selectedSystem)}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {selectedSystem.monitorBindingReady
                        ? 'Realtime 1-10 phút, history 1 giờ/lần.'
                        : selectedSystem.monitorBindingMessage || 'Cần hoàn tất gắn monitor trước khi auto sync.'}
                    </p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Lần sync thành công</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedSystem.lastSuccessfulSyncAt
                        ? formatDateTime(selectedSystem.lastSuccessfulSyncAt)
                        : 'Chưa có'}
                    </p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">Realtime kế tiếp</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedSystem.nextRealtimeSyncAt
                        ? formatDateTime(selectedSystem.nextRealtimeSyncAt)
                        : 'Chưa lên lịch'}
                    </p>
                  </div>
                  <div className="portal-card-soft p-4">
                    <p className="text-sm text-slate-400">History kế tiếp</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedSystem.nextHistorySyncAt
                        ? formatDateTime(selectedSystem.nextHistorySyncAt)
                        : 'Chưa lên lịch'}
                    </p>
                  </div>
                </div>

                {selectedSystem.lastSyncErrorMessage || selectedSystem.monitorBindingMessage ? (
                  <div
                    className={cn(
                      'rounded-[20px] border px-4 py-4 text-sm',
                      selectedSystem.lastSyncErrorMessage
                        ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300',
                    )}
                  >
                    <p className="font-semibold">
                      {selectedSystem.lastSyncErrorMessage ? 'Cảnh báo auto sync' : 'Tình trạng monitor binding'}
                    </p>
                    <p className="mt-2 leading-6">
                      {selectedSystem.lastSyncErrorMessage || selectedSystem.monitorBindingMessage}
                    </p>
                  </div>
                ) : null}

                {selectedSystem.monitorSyncLogs?.length ? (
                  <div className="portal-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-400">Nhật ký auto sync gần nhất</p>
                        <p className="mt-1 text-sm text-slate-300">
                          Realtime, history và closing job được gom về một lịch chung.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                        {formatNumber(selectedSystem.monitorSyncLogs.length)} bản ghi
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedSystem.monitorSyncLogs.slice(0, 5).map((log) => (
                        <div
                          key={log.id}
                          className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              {log.syncScope} • {log.scheduleTier || 'MANUAL'}
                            </p>
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                              {log.status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            {log.message || 'Không có ghi chú chi tiết.'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {formatDateTime(log.finishedAt || log.startedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                </>
              ) : null}

              {message ? <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
              {error ? <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : mode === 'create' ? 'Tạo hệ thống' : 'Lưu thay đổi'}
                </button>
                {mode === 'edit' && selectedSystem ? (
                  <button
                    type="button"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                    disabled={saving}
                    onClick={() => void onDelete()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa hệ thống
                  </button>
                ) : null}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Giám sát inverter" eyebrow="Xem trước và đồng bộ monitor" dark>
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                {[...providerOptions, deyeProviderOption].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateField('monitoringProvider', option.value)}
                    className={cn(
                      'rounded-[22px] border px-4 py-4 text-left transition',
                      form.monitoringProvider === option.value
                        ? 'border-white/20 bg-white text-slate-950'
                        : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                    )}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className={cn('mt-2 text-sm leading-6', form.monitoringProvider === option.value ? 'text-slate-600' : 'text-slate-400')}>
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>{monitorIdLabel(form.monitoringProvider)}</span>
                  <input className="portal-field" value={form.monitoringPlantId} onChange={(event) => updateField('monitoringPlantId', event.target.value)} placeholder={form.monitoringProvider === 'SOLARMAN' ? 'Ví dụ: 2612345' : 'Ví dụ: efec6088-...'} />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Nhà cung cấp monitor</span>
                  <input className="portal-field opacity-80" value={providerLabel(form.monitoringProvider)} readOnly />
                </label>
              </div>

              {form.monitoringProvider === 'SOLARMAN' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300"><span>Base URL SOLARMAN</span><input className="portal-field" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                  <label className="grid gap-2 text-sm text-slate-300"><span>App ID</span><input className="portal-field" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                  <label className="grid gap-2 text-sm text-slate-300"><span>App Secret</span><input className="portal-field" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                  <label className="grid gap-2 text-sm text-slate-300"><span>Tài khoản SOLARMAN</span><input className="portal-field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2"><span>Mật khẩu SOLARMAN</span><input type="password" className="portal-field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                </div>
              ) : form.monitoringProvider === 'DEYE' ? (
                <div className="portal-card-soft p-4 text-sm text-slate-300">
                  Với Deye OpenAPI, hãy dùng khối bên dưới để chọn connection, xem trước station và đồng bộ đúng station/device vào hệ thống hiện tại.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300"><span>Tài khoản SEMS</span><input className="portal-field" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                  <label className="grid gap-2 text-sm text-slate-300"><span>Mật khẩu SEMS</span><input type="password" className="portal-field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Để trống nếu dùng .env" /></label>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void onPreview()} className="btn-ghost" disabled={previewing}>
                  {previewing ? 'Đang xem trước...' : 'Xem trước dữ liệu'}
                </button>
                <button type="button" onClick={() => void onSyncMonitor()} className="btn-primary" disabled={syncing}>
                  {syncing ? 'Đang đồng bộ...' : 'Đồng bộ vào hệ thống'}
                </button>
              </div>

              <div className="portal-card-soft p-4">
                {preview ? (
                  <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-3">
                    <p>Provider: {providerLabel(preview.provider)}</p>
                    <p>Tên nhà máy: {preview.plantName || '-'}</p>
                    <p>{monitorIdLabel(form.monitoringProvider)}: {preview.plantId || '-'}</p>
                    <p>PV hiện tại: {metric(preview.currentPvKw, 'kW')}</p>
                    <p>Battery SOC: {metric(preview.batterySocPct, '%')}</p>
                    <p>Sản lượng hôm nay: {metric(preview.todayGeneratedKwh, 'kWh')}</p>
                    <p>Tổng sản lượng: {metric(preview.totalGeneratedKwh, 'kWh')}</p>
                    <p>Điện tải hôm nay: {metric(preview.todayLoadConsumedKwh, 'kWh')}</p>
                    <p>Trạng thái inverter: {preview.inverterStatus || 'Chưa có dữ liệu'}</p>
                    <p>Số serial: {preview.inverterSerial || '-'}</p>
                    <p>Lần lấy dữ liệu cuối: {preview.fetchedAt ? formatDateTime(preview.fetchedAt) : '-'}</p>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-slate-300">Chạy bản xem trước để kiểm tra dữ liệu realtime trước khi đồng bộ vào hệ thống.</p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Deye OpenAPI"
            eyebrow="Xem trước station, chọn inverter và đồng bộ vào system hiện tại"
            dark
          >
            {mode !== 'edit' || !selectedSystem ? (
              <div className="portal-card-soft p-5 text-sm text-slate-300">
                Hãy lưu hệ thống trước, sau đó chọn Deye connection để xem trước station và gán vào hệ thống này.
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_auto_auto] md:items-end">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Deye connection</span>
                    <select
                      className="portal-field"
                      value={selectedDeyeConnectionId}
                      onChange={(event) => setSelectedDeyeConnectionId(event.target.value)}
                    >
                      <option value="">Chọn kết nối Deye</option>
                      {deyeConnections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.accountName}
                          {connection.companyName ? ` - ${connection.companyName}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void onPreviewDeyeStations()}
                    disabled={deyePreviewing || !selectedDeyeConnectionId}
                  >
                    {deyePreviewing ? 'Đang xem trước...' : 'Xem trước dữ liệu'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void onSyncDeyeStation()}
                    disabled={
                      deyeSyncing ||
                      !selectedDeyeConnectionId ||
                      !selectedDeyeStationId ||
                      Boolean(
                        selectedDeyeStation?.linkedSystem &&
                          selectedDeyeStation.linkedSystem.id !== selectedSystem.id,
                      )
                    }
                  >
                    {deyeSyncing ? 'Đang đồng bộ...' : 'Đồng bộ vào hệ thống'}
                  </button>
                </div>

                {deyePreviewStations.length ? (
                  <div className="grid gap-4">
                    {deyePreviewStations.map((station) => {
                      const assignedElsewhere =
                        station.linkedSystem && station.linkedSystem.id !== selectedSystem.id;
                      const selected = selectedDeyeStationId === station.stationId;

                      return (
                        <button
                          key={station.stationId}
                          type="button"
                          onClick={() => {
                            if (!assignedElsewhere) {
                              setSelectedDeyeStationId(station.stationId);
                            }
                          }}
                          className={cn(
                            'w-full rounded-[24px] border px-4 py-4 text-left transition',
                            assignedElsewhere
                              ? 'cursor-not-allowed border-rose-300/20 bg-rose-400/10 text-rose-100'
                              : selected
                                ? 'border-white/20 bg-white text-slate-950'
                                : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Station ID {station.stationId}
                              </p>
                              <h3 className="mt-2 text-lg font-semibold">
                                {station.stationName || station.stationId}
                              </h3>
                              <p
                                className={cn(
                                  'mt-1 text-sm',
                                  selected && !assignedElsewhere ? 'text-slate-600' : 'text-slate-400',
                                )}
                              >
                                {station.locationAddress || station.ownerName || 'Chưa có địa chỉ station'}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'rounded-full px-3 py-1 text-xs font-semibold',
                                assignedElsewhere
                                  ? 'border border-rose-300/20 bg-rose-400/10 text-rose-100'
                                  : selected
                                    ? 'bg-slate-950 text-white'
                                    : 'border border-white/10 bg-white/5 text-slate-200',
                              )}
                            >
                              {assignedElsewhere
                                ? 'Đã gán system khác'
                                : selected
                                  ? 'Đã chọn'
                                  : 'Sẵn sàng nhập'}
                            </span>
                          </div>

                          <div
                            className={cn(
                              'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                              selected && !assignedElsewhere ? 'text-slate-700' : 'text-slate-300',
                            )}
                          >
                            <p>Công suất: {formatNumber(station.installedCapacityKw || 0, 'kWp')}</p>
                            <p>Timezone: {station.timezone || '-'}</p>
                            <p>Thiết bị: {formatNumber(station.deviceCount)}</p>
                            <p>PV tháng hiện tại: {formatNumber(station.currentMonthGenerationKwh || 0, 'kWh')}</p>
                            <p>PV năm hiện tại: {formatNumber(station.currentYearGenerationKwh || 0, 'kWh')}</p>
                            <p>Tổng sản lượng: {formatNumber(station.totalGenerationKwh || 0, 'kWh')}</p>
                            <p>Công suất tức thời: {formatNumber(station.currentGenerationPowerKw || 0, 'kW')}</p>
                            <p>Lần cập nhật cuối: {station.lastUpdateTime ? formatDateTime(station.lastUpdateTime) : '-'}</p>
                          </div>

                          {station.devices.length ? (
                            <div className="mt-4 overflow-x-auto rounded-[20px] border border-white/8 bg-slate-950/20 px-3 py-3">
                              <table className="min-w-[560px] w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                    <th className="pb-3 pr-4 font-medium">Serial</th>
                                    <th className="pb-3 pr-4 font-medium">Loại</th>
                                    <th className="pb-3 pr-4 font-medium">Product</th>
                                    <th className="pb-3 font-medium">Trạng thái</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {station.devices.map((device) => (
                                    <tr key={`${station.stationId}-${device.deviceSn}`} className="border-b border-white/6 last:border-none">
                                      <td className="py-3 pr-4 font-medium">{device.deviceSn}</td>
                                      <td className="py-3 pr-4">{device.deviceType || '-'}</td>
                                      <td className="py-3 pr-4">{device.productId || '-'}</td>
                                      <td className="py-3">{device.connectStatus || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {assignedElsewhere ? (
                            <p className="mt-4 text-sm leading-6 text-rose-100">
                              Station này đã được gán cho hệ thống {station.linkedSystem?.name} ({station.linkedSystem?.systemCode}). Hãy bỏ gán ở hệ thống kia trước khi nhập lại.
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="portal-card-soft p-5 text-sm text-slate-300">
                    Chọn Deye connection rồi bấm “Xem trước dữ liệu” để lấy danh sách station và device thật từ DeyeCloud.
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {selectedSystem && mode === 'edit' ? (
        <SectionCard
          title="Chi tiết station và thiết bị"
          eyebrow="Thông tin đồng bộ từ nguồn monitor, danh sách device và lịch sử PV gần nhất"
          dark
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tên station</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {selectedSystem.stationName || selectedSystem.name}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Timezone</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {selectedSystem.timeZone || 'Chưa có'}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Địa chỉ station</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {selectedSystem.locationAddress || selectedSystem.location || 'Chưa có'}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Chủ sở hữu</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {selectedSystem.ownerName || selectedSystem.customer?.companyName || selectedSystem.customer?.user?.fullName || 'Chưa có'}
                  </p>
                </div>
              </div>

              <div className="portal-card-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">Danh sách thiết bị</p>
                    <p className="mt-1 text-sm text-slate-300">
                      Inverter, collector và các device đồng bộ từ nguồn ngoài
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    {formatNumber(selectedSystem.devices?.length || 0)} thiết bị
                  </span>
                </div>

                {selectedSystem.devices?.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[640px] w-full text-left text-sm text-slate-300">
                      <thead>
                        <tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <th className="pb-3 pr-4 font-medium">Serial</th>
                          <th className="pb-3 pr-4 font-medium">Loại</th>
                          <th className="pb-3 pr-4 font-medium">Product</th>
                          <th className="pb-3 pr-4 font-medium">Trạng thái</th>
                          <th className="pb-3 font-medium">Thu thập cuối</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSystem.devices.map((device) => (
                          <tr key={device.id} className="border-b border-white/6 align-top last:border-none">
                            <td className="py-4 pr-4 font-medium text-white">{device.deviceSn}</td>
                            <td className="py-4 pr-4">{device.deviceType || '-'}</td>
                            <td className="py-4 pr-4">{device.productId || '-'}</td>
                            <td className="py-4 pr-4">{device.connectStatus || '-'}</td>
                            <td className="py-4">
                              {device.collectionTime
                                ? formatDateTime(new Date(device.collectionTime))
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                    Hệ thống này chưa có device nào được đồng bộ. Nếu đây là hệ thống Deye hoặc SOLARMAN, hãy chạy sync station trước.
                  </div>
                )}
              </div>
            </div>

            <div className="portal-card-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">Lịch sử PV tháng đã lưu</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Dữ liệu raw theo tháng lưu trong database trước khi phát hành billing
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  {formatNumber(selectedSystem.monthlyEnergyRecords?.length || 0)} bản ghi
                </span>
              </div>

              {selectedSystem.monthlyEnergyRecords?.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[680px] w-full text-left text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <th className="pb-3 pr-4 font-medium">Kỳ</th>
                        <th className="pb-3 pr-4 font-medium">PV tháng</th>
                        <th className="pb-3 pr-4 font-medium">Đơn giá</th>
                        <th className="pb-3 pr-4 font-medium">Tạm tính</th>
                        <th className="pb-3 pr-4 font-medium">Tổng cộng</th>
                        <th className="pb-3 pr-4 font-medium">Nguồn</th>
                        <th className="pb-3 font-medium">Đồng bộ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSystem.monthlyEnergyRecords.map((record) => (
                        <tr key={record.id} className="border-b border-white/6 align-top last:border-none">
                          <td className="py-4 pr-4 font-medium text-white">{formatMonthPeriod(record.month, record.year)}</td>
                          <td className="py-4 pr-4">{formatNumber(record.pvGenerationKwh, 'kWh')}</td>
                          <td className="py-4 pr-4">{formatCurrency(record.unitPrice)}</td>
                          <td className="py-4 pr-4">{formatCurrency(record.subtotalAmount)}</td>
                          <td className="py-4 pr-4 font-semibold text-white">{formatCurrency(record.totalAmount)}</td>
                          <td className="py-4 pr-4">{record.source}</td>
                          <td className="py-4">{formatDateTime(record.syncTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Chưa có monthly history raw cho hệ thống này. Với Deye, hãy vào kết nối Deye và chạy sync monthly history để lấy generationValue theo tháng.
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <SectionCard title="Đồng bộ sản lượng PV theo tháng" eyebrow="Billable kWh = tổng sản lượng PV tháng" dark>
          {mode !== 'edit' || !selectedSystem ? (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chọn một hệ thống để đồng bộ kỳ tháng</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Sau khi lưu hệ thống, bạn có thể đồng bộ sản lượng PV theo từng tháng, cập nhật lại tháng cũ và phát hành hóa đơn đúng theo sản lượng PV đã lưu.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tổng PV đã lưu</p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatNumber(monthlySummary.totalPv, 'kWh')}</p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tổng tiền phải thu</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">{formatCurrency(monthlySummary.totalAmount)}</p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Lần đồng bộ gần nhất</p>
                  <p className="mt-2 text-lg font-semibold text-white">{monthlySummary.latestSync ? formatDateTime(monthlySummary.latestSync) : 'Chưa có'}</p>
                </div>
              </div>

              <form onSubmit={onSubmitMonthly} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Tháng</span>
                    <input type="number" min="1" max="12" className={cn('portal-field', monthlyFieldErrors.month && 'border-rose-300/40')} value={monthlyForm.month} onChange={(event) => updateMonthlyField('month', event.target.value)} />
                    {monthlyFieldErrors.month ? <span className="text-xs text-rose-300">{monthlyFieldErrors.month}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Năm</span>
                    <input type="number" min="2020" max="2100" className={cn('portal-field', monthlyFieldErrors.year && 'border-rose-300/40')} value={monthlyForm.year} onChange={(event) => updateMonthlyField('year', event.target.value)} />
                    {monthlyFieldErrors.year ? <span className="text-xs text-rose-300">{monthlyFieldErrors.year}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>PV tháng (kWh)</span>
                    <input type="number" min="0" step="0.01" className={cn('portal-field', monthlyFieldErrors.pvGenerationKwh && 'border-rose-300/40')} value={monthlyForm.pvGenerationKwh} onChange={(event) => updateMonthlyField('pvGenerationKwh', event.target.value)} placeholder="Để trống để tổng hợp từ daily record" />
                    {monthlyFieldErrors.pvGenerationKwh ? <span className="text-xs text-rose-300">{monthlyFieldErrors.pvGenerationKwh}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Đơn giá (VND/kWh)</span>
                    <input type="number" min="0" step="0.01" className={cn('portal-field', monthlyFieldErrors.unitPrice && 'border-rose-300/40')} value={monthlyForm.unitPrice} onChange={(event) => updateMonthlyField('unitPrice', event.target.value)} placeholder="Để trống nếu lấy từ hợp đồng" />
                    {monthlyFieldErrors.unitPrice ? <span className="text-xs text-rose-300">{monthlyFieldErrors.unitPrice}</span> : null}
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Thuế suất (%)</span>
                    <input type="number" min="0" step="0.01" className={cn('portal-field', monthlyFieldErrors.taxRate && 'border-rose-300/40')} value={monthlyForm.taxRate} onChange={(event) => updateMonthlyField('taxRate', event.target.value)} placeholder="Ví dụ 8 hoặc 10" />
                    {monthlyFieldErrors.taxRate ? <span className="text-xs text-rose-300">{monthlyFieldErrors.taxRate}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Chiết khấu</span>
                    <input type="number" min="0" step="0.01" className={cn('portal-field', monthlyFieldErrors.discountAmount && 'border-rose-300/40')} value={monthlyForm.discountAmount} onChange={(event) => updateMonthlyField('discountAmount', event.target.value)} placeholder="0" />
                    {monthlyFieldErrors.discountAmount ? <span className="text-xs text-rose-300">{monthlyFieldErrors.discountAmount}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 lg:col-span-2">
                    <span>Nguồn dữ liệu</span>
                    <select className="portal-field" value={monthlyForm.source} onChange={(event) => updateMonthlyField('source', event.target.value)}>
                      {monthlySourceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Ghi chú</span>
                  <textarea className="portal-field min-h-[110px]" value={monthlyForm.note} onChange={(event) => updateMonthlyField('note', event.target.value)} placeholder="Ví dụ: đồng bộ lại theo số liệu inverter, đã điều chỉnh thuế 8%, kỳ bù trừ..." />
                </label>

                {editingMonthlyId ? (
                  <div className="portal-card-soft p-4 text-sm text-slate-300">
                    Bạn đang chỉnh sửa bản ghi kỳ <span className="font-semibold text-white">{formatMonthPeriod(Number(monthlyForm.month), Number(monthlyForm.year))}</span>. Lưu lại để cập nhật bản ghi này, hoặc nhấn làm mới biểu mẫu để quay lại chế độ đồng bộ mới.
                  </div>
                ) : null}

                {monthlyMessage ? <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{monthlyMessage}</div> : null}
                {monthlyError ? <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{monthlyError}</div> : null}

                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn-primary" disabled={monthlySaving}>
                    {monthlySaving ? 'Đang lưu kỳ tháng...' : editingMonthlyId ? 'Lưu chỉnh sửa bản ghi tháng' : 'Đồng bộ kỳ tháng'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={resetMonthlyEditor}>
                    Làm mới biểu mẫu
                  </button>
                </div>
              </form>
            </div>
          )}
        </SectionCard>

        <MonthlyPvBillingTable
          title="Lịch sử sản lượng PV theo tháng"
          eyebrow="Lịch sử đồng bộ, tính tiền và phát hành hóa đơn"
          records={monthlyRecords}
          emptyTitle="Chưa có bản ghi PV cho hệ thống này"
          emptyBody="Sau khi đồng bộ kỳ tháng đầu tiên, hệ thống sẽ lưu sản lượng PV, đơn giá và trạng thái hóa đơn tại đây."
          actions={(record) => (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost !min-h-[42px] !px-3 !py-2 text-xs" onClick={() => startEditMonthly(record)}>
                Nạp vào form
              </button>
              {record.invoice ? (
                <button type="button" className="btn-ghost !min-h-[42px] !px-3 !py-2 text-xs" onClick={() => void downloadInvoicePdfRequest(record.invoice!.id)}>
                  Tải PDF
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                  disabled={invoiceLoadingId === record.id}
                  onClick={() => void onGenerateInvoice(record)}
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  {invoiceLoadingId === record.id ? 'Đang xuất...' : 'Xuất hóa đơn'}
                </button>
              )}
              {!record.invoice ? (
                <button
                  type="button"
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/15"
                  disabled={deletingMonthlyId === record.id}
                  onClick={() => void onDeleteMonthly(record)}
                >
                  {deletingMonthlyId === record.id ? 'Đang xóa...' : 'Xóa'}
                </button>
              ) : null}
            </div>
          )}
          className={monthlyLoading ? 'opacity-80' : undefined}
        />
      </div>
    </div>
  );
}
