'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  importOperationalDataRequest,
  listCustomersRequest,
  listSystemOperationalRecordsRequest,
  operationalOverviewRequest,
  upsertSystemOperationalRecordRequest,
} from '@/lib/api';
import { formatCurrency, formatDateTime, formatMonthPeriod, formatNumber } from '@/lib/utils';
import {
  CustomerRecord,
  ImportOperationalDataResponse,
  OperationalOverviewResponse,
  SystemOperationalRecordsResponse,
} from '@/types';

type FilterState = {
  customerId: string;
  sourceKind: string;
  systemStatus: string;
};

type ManualFormState = {
  month: string;
  year: string;
  pvGenerationKwh: string;
  loadConsumedKwh: string;
  meterReadingStart: string;
  meterReadingEnd: string;
  savingsAmount: string;
  unitPrice: string;
  vatRate: string;
  discountAmount: string;
  systemStatus: string;
  source: string;
  note: string;
};

const defaultFilters: FilterState = {
  customerId: '',
  sourceKind: '',
  systemStatus: '',
};

const defaultForm = (): ManualFormState => {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    pvGenerationKwh: '',
    loadConsumedKwh: '',
    meterReadingStart: '',
    meterReadingEnd: '',
    savingsAmount: '',
    unitPrice: '2500',
    vatRate: '8',
    discountAmount: '0',
    systemStatus: 'ACTIVE',
    source: 'MANUAL_ENTRY',
    note: '',
  };
};

function buildForm(detail: SystemOperationalRecordsResponse | null): ManualFormState {
  const latest = detail?.records?.[0];
  if (!latest) return defaultForm();
  return {
    month: String(latest.month),
    year: String(latest.year),
    pvGenerationKwh: String(latest.pvGenerationKwh ?? ''),
    loadConsumedKwh:
      latest.loadConsumedKwh !== null && latest.loadConsumedKwh !== undefined
        ? String(latest.loadConsumedKwh)
        : '',
    meterReadingStart:
      latest.meterReadingStart !== null && latest.meterReadingStart !== undefined
        ? String(latest.meterReadingStart)
        : '',
    meterReadingEnd:
      latest.meterReadingEnd !== null && latest.meterReadingEnd !== undefined
        ? String(latest.meterReadingEnd)
        : '',
    savingsAmount:
      latest.savingsAmount !== null && latest.savingsAmount !== undefined
        ? String(latest.savingsAmount)
        : '',
    unitPrice: String(latest.unitPrice ?? 2500),
    vatRate: String(latest.vatRate ?? 8),
    discountAmount: String(latest.discountAmount ?? 0),
    systemStatus: latest.systemStatusSnapshot || detail?.system.status || 'ACTIVE',
    source: latest.source || 'MANUAL_ENTRY',
    note: latest.note || '',
  };
}

export default function AdminOperationalDataPage() {
  const [overview, setOverview] = useState<OperationalOverviewResponse | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [detail, setDetail] = useState<SystemOperationalRecordsResponse | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [manualForm, setManualForm] = useState<ManualFormState>(defaultForm());
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importResult, setImportResult] = useState<ImportOperationalDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadOverview(preferredSystemId?: string) {
    const [nextOverview, nextCustomers] = await Promise.all([
      operationalOverviewRequest({
        customerId: filters.customerId || undefined,
        sourceKind: filters.sourceKind || undefined,
        systemStatus: filters.systemStatus || undefined,
      }),
      listCustomersRequest(),
    ]);

    setOverview(nextOverview);
    setCustomers(nextCustomers);

    const nextSelectedId = preferredSystemId || selectedSystemId || nextOverview.systems[0]?.id || '';
    setSelectedSystemId(nextSelectedId);
    return nextSelectedId;
  }

  async function loadDetail(systemId: string) {
    if (!systemId) {
      setDetail(null);
      setManualForm(defaultForm());
      return;
    }

    setDetailLoading(true);
    try {
      const nextDetail = await listSystemOperationalRecordsRequest(systemId);
      setDetail(nextDetail);
      setManualForm(buildForm(nextDetail));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadOverview()
      .then((systemId) => loadDetail(systemId))
      .catch((requestError) =>
        setError(
          requestError instanceof Error ? requestError.message : 'Khong the tai module du lieu van hanh.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSystemId) return;
    loadDetail(selectedSystemId).catch((requestError) =>
      setError(
        requestError instanceof Error ? requestError.message : 'Khong the tai chi tiet du lieu he thong.',
      ),
    );
  }, [selectedSystemId]);

  const filteredSystems = useMemo(() => overview?.systems || [], [overview]);
  const selectedSystem = useMemo(
    () => filteredSystems.find((item) => item.id === selectedSystemId) || null,
    [filteredSystems, selectedSystemId],
  );

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const nextSelectedId = await loadOverview(selectedSystemId);
      await loadDetail(nextSelectedId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Khong the tai lai du lieu van hanh.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleRefresh();
  }

  async function handleSaveManualRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSystemId) {
      setError('Vui long chon he thong can cap nhat.');
      return;
    }
    if (!manualForm.pvGenerationKwh.trim() || Number(manualForm.pvGenerationKwh) < 0) {
      setError('Vui long nhap san luong PV hop le truoc khi luu.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await upsertSystemOperationalRecordRequest(selectedSystemId, {
        month: Number(manualForm.month),
        year: Number(manualForm.year),
        pvGenerationKwh: Number(manualForm.pvGenerationKwh),
        ...(manualForm.loadConsumedKwh.trim() ? { loadConsumedKwh: Number(manualForm.loadConsumedKwh) } : {}),
        ...(manualForm.meterReadingStart.trim()
          ? { meterReadingStart: Number(manualForm.meterReadingStart) }
          : {}),
        ...(manualForm.meterReadingEnd.trim()
          ? { meterReadingEnd: Number(manualForm.meterReadingEnd) }
          : {}),
        ...(manualForm.savingsAmount.trim() ? { savingsAmount: Number(manualForm.savingsAmount) } : {}),
        ...(manualForm.unitPrice.trim() ? { unitPrice: Number(manualForm.unitPrice) } : {}),
        ...(manualForm.vatRate.trim() ? { vatRate: Number(manualForm.vatRate) } : {}),
        ...(manualForm.discountAmount.trim() ? { discountAmount: Number(manualForm.discountAmount) } : {}),
        ...(manualForm.systemStatus ? { systemStatus: manualForm.systemStatus } : {}),
        ...(manualForm.source ? { source: manualForm.source } : {}),
        ...(manualForm.note.trim() ? { note: manualForm.note.trim() } : {}),
      });

      setMessage('Da luu ky du lieu van hanh va dong bo billing tam tinh cho he thong.');
      await loadOverview(selectedSystemId);
      await loadDetail(selectedSystemId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Khong the luu du lieu van hanh.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    if (!importFiles.length) {
      setError('Vui long chon it nhat mot file CSV hoac Excel truoc khi import.');
      return;
    }

    setImporting(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();
      importFiles.forEach((file) => formData.append('files', file));
      const result = await importOperationalDataRequest(formData, {
        source: 'CSV_IMPORT',
        overwriteExisting: true,
        syncBilling: true,
      });
      setImportResult(result);
      setMessage(
        `Da xu ly ${result.totalFiles || importFiles.length} file, import thanh cong ${result.importedRows}/${result.totalRows} dong du lieu.`,
      );
      const nextSelectedId = await loadOverview(selectedSystemId);
      await loadDetail(nextSelectedId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Khong the import file du lieu van hanh.');
    } finally {
      setImporting(false);
    }
  }

  if (loading && !overview) {
    return (
      <SectionCard title="Du lieu van hanh" eyebrow="Manual-first / semi-auto" dark>
        <p className="text-sm text-slate-300">Dang tai danh muc du lieu van hanh...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Tong he thong</p>
          <p className="mt-3 text-3xl font-semibold text-white">{overview?.summary.totalSystems || 0}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Da cap nhat</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-200">{overview?.summary.readySystems || 0}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Can cap nhat</p>
          <p className="mt-3 text-3xl font-semibold text-amber-200">{overview?.summary.staleSystems || 0}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Chua co ky du lieu</p>
          <p className="mt-3 text-3xl font-semibold text-slate-200">{overview?.summary.missingSystems || 0}</p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-[20px] border px-4 py-3 text-sm ${
            error
              ? 'border-rose-300/20 bg-rose-400/10 text-rose-100'
              : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <div className="space-y-5">
          <SectionCard title="Danh muc du lieu ky thang" eyebrow="He thong va trang thai cap nhat" dark>
            <form onSubmit={handleApplyFilters} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Khach hang</span>
                  <select className="portal-field" value={filters.customerId} onChange={(event) => updateFilter('customerId', event.target.value)}>
                    <option value="">Tat ca</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.companyName || customer.user?.fullName || customer.customerCode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Nguon du lieu</span>
                  <select className="portal-field" value={filters.sourceKind} onChange={(event) => updateFilter('sourceKind', event.target.value)}>
                    <option value="">Tat ca</option>
                    <option value="MANUAL">Nhap tay</option>
                    <option value="CSV_IMPORT">CSV / Excel</option>
                    <option value="API_PROVIDER">API</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Trang thai he thong</span>
                  <select className="portal-field" value={filters.systemStatus} onChange={(event) => updateFilter('systemStatus', event.target.value)}>
                    <option value="">Tat ca</option>
                    <option value="ACTIVE">Dang hoat dong</option>
                    <option value="MAINTENANCE">Bao tri</option>
                    <option value="WARNING">Canh bao</option>
                    <option value="FAULT">Loi</option>
                    <option value="OFFLINE">Mat ket noi</option>
                  </select>
                </label>
                <div className="flex items-end gap-3">
                  <button type="submit" className="btn-primary inline-flex w-full justify-center md:w-auto">
                    Loc
                  </button>
                  <button type="button" className="btn-ghost inline-flex w-full justify-center md:w-auto" onClick={() => void handleRefresh()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tai lai
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-5 grid gap-3">
              {filteredSystems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  onClick={() => setSelectedSystemId(system.id)}
                  className={`portal-card-soft grid gap-3 p-4 text-left transition ${
                    selectedSystemId === system.id ? 'border-emerald-300/25 bg-emerald-400/10' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{system.systemCode}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{system.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {system.customer?.companyName || system.customer?.fullName || 'Chua gan khach hang'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        system.dataFreshness.code === 'READY'
                          ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                          : system.dataFreshness.code === 'STALE'
                            ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                            : 'border-white/10 bg-white/[0.06] text-slate-200'
                      }`}
                    >
                      {system.dataFreshness.label}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Ky gan nhat</p>
                      <p className="mt-2 text-sm text-white">{system.latestPeriod || 'Dang cap nhat'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Nguon</p>
                      <p className="mt-2 text-sm text-white">{system.latestSourceLabel || 'Dang cap nhat'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">PV gan nhat</p>
                      <p className="mt-2 text-sm text-white">
                        {system.latestPvGenerationKwh != null ? formatNumber(system.latestPvGenerationKwh, 'kWh') : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Cap nhat</p>
                      <p className="mt-2 text-sm text-white">{system.latestUpdatedAt ? formatDateTime(system.latestUpdatedAt) : 'Chua co'}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Import CSV / Excel" eyebrow="Cap nhat nhieu he thong cung luc" dark>
            <div className="grid gap-4">
              <div className="rounded-[22px] border border-dashed border-white/12 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Dinh dang file ghi dien dang ho tro</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      He thong da nhan truc tiep bo cot xuat tu file ghi dien:
                      <span className="font-semibold text-slate-200"> Ten du an</span>,
                      <span className="font-semibold text-slate-200"> Thoi gian cap nhat</span>,
                      <span className="font-semibold text-slate-200"> Mui gio</span>,
                      <span className="font-semibold text-slate-200"> Luong dien phat -Trong thang(kWh)</span>.
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Cot tuy chon dang duoc nhan: <span className="font-semibold text-slate-200">Luong dien tieu thu -Trong thang(kWh)</span>,
                      <span className="font-semibold text-slate-200"> Cong suat cap len luoi -Trong thang(kWh)</span>,
                      <span className="font-semibold text-slate-200"> Nang luong da mua -Trong thang(kWh)</span>,
                      <span className="font-semibold text-slate-200"> Ty le tu su dung(%)</span>,
                      <span className="font-semibold text-slate-200"> Loi nhuan du doan(VND)</span>.
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Neu file khong co <span className="font-semibold text-slate-200">systemCode</span>, he thong se tu doi soat theo
                      <span className="font-semibold text-slate-200"> Ten du an/site</span>.
                    </p>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                    <FileSpreadsheet className="h-4 w-4" />
                    {importFiles.length
                      ? importFiles.length === 1
                        ? importFiles[0].name
                        : `${importFiles.length} file da chon`
                      : 'Chon file import'}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      multiple
                      className="hidden"
                      onChange={(event) =>
                        setImportFiles(Array.from(event.target.files || []))
                      }
                    />
                  </label>
                </div>

                {importFiles.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {importFiles.map((file) => (
                      <span
                        key={`${file.name}-${file.lastModified}`}
                        className="inline-flex rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-200"
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="btn-primary inline-flex" onClick={() => void handleImport()} disabled={importing}>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {importing ? 'Dang import...' : 'Import du lieu'}
                  </button>
                  <p className="text-sm text-slate-400">
                    He thong se tu validate cot, tach ky YYYY/MM, doi soat ten du an voi site/he thong hien co va cap nhat billing tam tinh.
                  </p>
                </div>
              </div>

              {importResult ? (
                <div className="portal-card-soft p-4">
                  <p className="text-sm font-semibold text-white">
                    Ket qua import: {importResult.importedRows}/{importResult.totalRows} dong thanh cong
                  </p>
                  {importResult.files?.length ? (
                    <div className="mt-3 space-y-2">
                      {importResult.files.map((file) => (
                        <div
                          key={`${file.fileName}-${file.sheetName || 'sheet'}`}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300"
                        >
                          <p className="font-semibold text-slate-100">{file.fileName}</p>
                          <p className="mt-1">
                            {file.importedRows}/{file.totalRows} dong thanh cong
                            {file.sheetName ? ` • Sheet ${file.sheetName}` : ''}
                            {file.message ? ` • ${file.message}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {importResult.errors.length ? (
                    <div className="mt-3 space-y-2">
                      {importResult.errors.slice(0, 6).map((item, index) => (
                        <p key={`${item.row || index}`} className="text-xs leading-5 text-amber-100">
                          Dong {String(item.row || index)}: {String(item.message || 'Khong the xu ly du lieu')}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-300">Khong co dong nao bi loi.</p>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Cap nhat thu cong" eyebrow="Du lieu theo ky cho tung he thong" dark>
            {selectedSystem ? (
              <div className="space-y-4">
                <div className="portal-card-soft p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-200">
                      <DatabaseZap className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{selectedSystem.systemCode}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{selectedSystem.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {selectedSystem.customer?.companyName || selectedSystem.customer?.fullName || 'Chua gan khach hang'}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveManualRecord} className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm text-slate-300"><span>Thang</span><input className="portal-field" type="number" min={1} max={12} value={manualForm.month} onChange={(event) => updateForm('month', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Nam</span><input className="portal-field" type="number" min={2020} max={2100} value={manualForm.year} onChange={(event) => updateForm('year', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>San luong PV (kWh)</span><input className="portal-field" type="number" min={0} step="0.01" value={manualForm.pvGenerationKwh} onChange={(event) => updateForm('pvGenerationKwh', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Dien tieu thu (kWh)</span><input className="portal-field" type="number" min={0} step="0.01" value={manualForm.loadConsumedKwh} onChange={(event) => updateForm('loadConsumedKwh', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Chi so cu</span><input className="portal-field" type="number" min={0} step="0.01" value={manualForm.meterReadingStart} onChange={(event) => updateForm('meterReadingStart', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Chi so moi</span><input className="portal-field" type="number" min={0} step="0.01" value={manualForm.meterReadingEnd} onChange={(event) => updateForm('meterReadingEnd', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Tien tiet kiem</span><input className="portal-field" type="number" min={0} step="1" value={manualForm.savingsAmount} onChange={(event) => updateForm('savingsAmount', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Nguon du lieu</span><select className="portal-field" value={manualForm.source} onChange={(event) => updateForm('source', event.target.value)}><option value="MANUAL_ENTRY">Nhap tay</option><option value="SEMI_AUTO_IMPORT">Ban tu dong</option><option value="CSV_IMPORT">CSV / Excel</option></select></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Don gia (d/kWh)</span><input className="portal-field" type="number" min={0} step="1" value={manualForm.unitPrice} onChange={(event) => updateForm('unitPrice', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>VAT (%)</span><input className="portal-field" type="number" min={0} step="0.01" value={manualForm.vatRate} onChange={(event) => updateForm('vatRate', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Chiet khau</span><input className="portal-field" type="number" min={0} step="1" value={manualForm.discountAmount} onChange={(event) => updateForm('discountAmount', event.target.value)} /></label>
                    <label className="grid gap-2 text-sm text-slate-300"><span>Trang thai he thong</span><select className="portal-field" value={manualForm.systemStatus} onChange={(event) => updateForm('systemStatus', event.target.value)}><option value="ACTIVE">Dang hoat dong</option><option value="MAINTENANCE">Dang bao tri</option><option value="WARNING">Canh bao</option><option value="FAULT">Loi</option><option value="OFFLINE">Mat ket noi</option><option value="INACTIVE">Tam dung</option></select></label>
                  </div>

                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Ghi chu</span>
                    <textarea className="portal-field min-h-[110px]" value={manualForm.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="Vi du: da doi soat file dien nang tu doi van hanh ngay 28/03." />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className="btn-primary inline-flex" disabled={saving}>{saving ? 'Dang luu...' : 'Luu ky du lieu'}</button>
                    <button type="button" className="btn-ghost inline-flex" onClick={() => setManualForm(buildForm(detail))}>Dat theo ban ghi gan nhat</button>
                  </div>
                </form>
              </div>
            ) : (
              <p className="text-sm text-slate-300">Chon mot he thong o cot ben trai de cap nhat ky du lieu.</p>
            )}
          </SectionCard>

          <SectionCard title="Lich su du lieu thang" eyebrow="Ban ghi van hanh va billing gan day" dark>
            {detailLoading ? (
              <p className="text-sm text-slate-300">Dang tai lich su du lieu...</p>
            ) : detail?.records?.length ? (
              <div className="space-y-3">
                {detail.records.slice(0, 8).map((record) => (
                  <div key={record.id} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{formatMonthPeriod(record.month, record.year)}</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatNumber(record.pvGenerationKwh, 'kWh')}</p>
                        <p className="mt-1 text-sm text-slate-400">{record.sourceLabel || record.source} • {record.dataFreshness?.label || 'Dang cap nhat'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatCurrency(record.totalAmount)}</p>
                        <p className="mt-1 text-xs text-slate-400">{record.billing?.status || 'Tam tinh'} • {formatDateTime(record.syncTime)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Tieu thu</p><p className="mt-2 text-sm text-white">{record.loadConsumedKwh != null ? formatNumber(record.loadConsumedKwh, 'kWh') : '-'}</p></div>
                      <div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Chi so</p><p className="mt-2 text-sm text-white">{record.meterReadingStart != null || record.meterReadingEnd != null ? `${record.meterReadingStart != null ? record.meterReadingStart.toLocaleString('vi-VN') : 'Chua cap nhat'} -> ${record.meterReadingEnd != null ? record.meterReadingEnd.toLocaleString('vi-VN') : 'Chua cap nhat'}` : '-'}</p></div>
                      <div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Tiet kiem</p><p className="mt-2 text-sm text-white">{record.savingsAmount != null ? formatCurrency(record.savingsAmount) : '-'}</p></div>
                      <div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Cap nhat boi</p><p className="mt-2 text-sm text-white">{record.updatedByUser?.fullName || 'He thong'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-300">He thong nay chua co ban ghi du lieu thang.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
