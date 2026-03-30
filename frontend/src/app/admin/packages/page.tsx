'use client';

import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  createServicePackageRequest,
  deleteServicePackageRequest,
  listServicePackagesRequest,
  updateServicePackageRequest,
} from '@/lib/api';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { ServicePackageRecord } from '@/types';

type PackageFormState = {
  packageCode: string;
  name: string;
  contractType: string;
  shortDescription: string;
  pricePerKwh: string;
  fixedMonthlyFee: string;
  maintenanceFee: string;
  annualEscalationRate: string;
  vatRate: string;
  lateFeeRate: string;
  earlyDiscountRate: string;
  defaultTermMonths: string;
  billingRule: string;
  notes: string;
  isActive: boolean;
};

type FieldErrors = Partial<Record<keyof PackageFormState, string>>;

const contractTypeOptions = [
  { value: 'PPA_KWH', label: 'PPA' },
  { value: 'LEASE', label: 'Lease' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'INSTALLMENT', label: 'Installment' },
  { value: 'SALE', label: 'Custom' },
];

function emptyForm(): PackageFormState {
  return {
    packageCode: '',
    name: '',
    contractType: 'PPA_KWH',
    shortDescription: '',
    pricePerKwh: '',
    fixedMonthlyFee: '',
    maintenanceFee: '',
    annualEscalationRate: '',
    vatRate: '8',
    lateFeeRate: '',
    earlyDiscountRate: '',
    defaultTermMonths: '',
    billingRule: 'PV_MONTHLY_GENERATION',
    notes: '',
    isActive: true,
  };
}

function buildForm(servicePackage: ServicePackageRecord | null): PackageFormState {
  if (!servicePackage) {
    return emptyForm();
  }

  return {
    packageCode: servicePackage.packageCode || '',
    name: servicePackage.name || '',
    contractType: servicePackage.contractType || 'PPA_KWH',
    shortDescription: servicePackage.shortDescription || '',
    pricePerKwh:
      servicePackage.pricePerKwh !== null && servicePackage.pricePerKwh !== undefined
        ? String(servicePackage.pricePerKwh)
        : '',
    fixedMonthlyFee:
      servicePackage.fixedMonthlyFee !== null && servicePackage.fixedMonthlyFee !== undefined
        ? String(servicePackage.fixedMonthlyFee)
        : '',
    maintenanceFee:
      servicePackage.maintenanceFee !== null && servicePackage.maintenanceFee !== undefined
        ? String(servicePackage.maintenanceFee)
        : '',
    annualEscalationRate:
      servicePackage.annualEscalationRate !== null &&
      servicePackage.annualEscalationRate !== undefined
        ? String(servicePackage.annualEscalationRate)
        : '',
    vatRate:
      servicePackage.vatRate !== null && servicePackage.vatRate !== undefined
        ? String(servicePackage.vatRate)
        : '',
    lateFeeRate:
      servicePackage.lateFeeRate !== null && servicePackage.lateFeeRate !== undefined
        ? String(servicePackage.lateFeeRate)
        : '',
    earlyDiscountRate:
      servicePackage.earlyDiscountRate !== null &&
      servicePackage.earlyDiscountRate !== undefined
        ? String(servicePackage.earlyDiscountRate)
        : '',
    defaultTermMonths:
      servicePackage.defaultTermMonths !== null &&
      servicePackage.defaultTermMonths !== undefined
        ? String(servicePackage.defaultTermMonths)
        : '',
    billingRule: servicePackage.billingRule || 'PV_MONTHLY_GENERATION',
    notes: servicePackage.notes || '',
    isActive: servicePackage.isActive,
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function modelLabel(contractType: string) {
  return contractTypeOptions.find((option) => option.value === contractType)?.label || contractType;
}

function validateForm(form: PackageFormState) {
  const errors: FieldErrors = {};

  if (!form.packageCode.trim()) {
    errors.packageCode = 'Vui lòng nhập mã gói.';
  }

  if (!form.name.trim()) {
    errors.name = 'Vui lòng nhập tên gói.';
  }

  if (form.pricePerKwh.trim() && Number(form.pricePerKwh) < 0) {
    errors.pricePerKwh = 'Đơn giá không hợp lệ.';
  }

  if (form.fixedMonthlyFee.trim() && Number(form.fixedMonthlyFee) < 0) {
    errors.fixedMonthlyFee = 'Phí cố định không hợp lệ.';
  }

  if (form.vatRate.trim() && (Number(form.vatRate) < 0 || Number(form.vatRate) > 100)) {
    errors.vatRate = 'VAT mặc định phải nằm trong 0-100%.';
  }

  if (
    form.defaultTermMonths.trim() &&
    (!Number.isInteger(Number(form.defaultTermMonths)) || Number(form.defaultTermMonths) <= 0)
  ) {
    errors.defaultTermMonths = 'Thời hạn mặc định phải là số tháng lớn hơn 0.';
  }

  return errors;
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<ServicePackageRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PackageFormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedId) || null,
    [packages, selectedId],
  );

  const filteredPackages = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return packages;
    }

    return packages.filter((servicePackage) =>
      [
        servicePackage.packageCode,
        servicePackage.name,
        servicePackage.shortDescription,
        servicePackage.billingRule,
        servicePackage.contractType,
        servicePackage.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [packages, search]);

  const stats = useMemo(() => {
    const activeCount = packages.filter((item) => item.isActive).length;
    const ppaCount = packages.filter((item) => item.contractType === 'PPA_KWH').length;

    return {
      total: packages.length,
      active: activeCount,
      archived: packages.length - activeCount,
      ppa: ppaCount,
    };
  }, [packages]);

  async function loadPackages(nextSelectedId?: string) {
    const nextPackages = await listServicePackagesRequest();
    setPackages(nextPackages);
    const fallbackId = nextSelectedId || nextPackages[0]?.id || '';
    setSelectedId(fallbackId);

    if (mode === 'edit') {
      setForm(buildForm(nextPackages.find((item) => item.id === fallbackId) || null));
    }
  }

  useEffect(() => {
    loadPackages()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải danh mục gói dịch vụ.',
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildForm(selectedPackage));
      setFieldErrors({});
    }
  }, [mode, selectedPackage]);

  function updateField<K extends keyof PackageFormState>(key: K, value: PackageFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function startCreate() {
    setMode('create');
    setSelectedId('');
    setForm(emptyForm());
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  function startEdit(id: string) {
    setMode('edit');
    setSelectedId(id);
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await loadPackages(selectedId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải lại danh mục gói dịch vụ.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    const nextErrors = validateForm(form);
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setError('Vui lòng kiểm tra lại các trường đang được đánh dấu.');
      return;
    }

    const payload = {
      packageCode: form.packageCode.trim().toUpperCase(),
      name: form.name.trim(),
      contractType: form.contractType,
      shortDescription: form.shortDescription.trim() || undefined,
      pricePerKwh: parseOptionalNumber(form.pricePerKwh),
      fixedMonthlyFee: parseOptionalNumber(form.fixedMonthlyFee),
      maintenanceFee: parseOptionalNumber(form.maintenanceFee),
      annualEscalationRate: parseOptionalNumber(form.annualEscalationRate),
      vatRate: parseOptionalNumber(form.vatRate),
      lateFeeRate: parseOptionalNumber(form.lateFeeRate),
      earlyDiscountRate: parseOptionalNumber(form.earlyDiscountRate),
      defaultTermMonths: parseOptionalNumber(form.defaultTermMonths),
      billingRule: form.billingRule.trim() || undefined,
      notes: form.notes.trim() || undefined,
      isActive: form.isActive,
    };

    setSaving(true);

    try {
      if (mode === 'create') {
        const created = await createServicePackageRequest(payload);
        await loadPackages(created.id);
        setMode('edit');
        setMessage('Đã tạo gói dịch vụ mới.');
      } else if (selectedPackage) {
        const updated = await updateServicePackageRequest(selectedPackage.id, payload);
        await loadPackages(updated.id);
        setMessage('Đã cập nhật gói dịch vụ.');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể lưu gói dịch vụ.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!selectedPackage) {
      return;
    }

    if (!window.confirm(`Lưu trữ gói "${selectedPackage.name}"?`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await deleteServicePackageRequest(selectedPackage.id);
      await loadPackages();
      setMode('edit');
      setMessage('Đã lưu trữ gói dịch vụ.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể lưu trữ gói dịch vụ.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(servicePackage: ServicePackageRecord) {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await updateServicePackageRequest(servicePackage.id, {
        isActive: !servicePackage.isActive,
      });
      await loadPackages(servicePackage.id);
      setMessage(
        !servicePackage.isActive
          ? 'Đã kích hoạt lại gói dịch vụ.'
          : 'Đã chuyển gói dịch vụ sang trạng thái tạm ngưng.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể cập nhật trạng thái gói dịch vụ.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Gói dịch vụ" eyebrow="Catalog dịch vụ và rule giá" dark>
        <p className="text-sm text-slate-300">Đang tải danh mục gói dịch vụ...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Tổng gói dịch vụ</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(stats.total)}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Đang hoạt động</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(stats.active)}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Tạm ngưng</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(stats.archived)}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Gói PPA</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(stats.ppa)}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="Danh mục gói dịch vụ" eyebrow="Chọn gói để sửa hoặc bật tắt trạng thái" dark>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={startCreate}>
                <Plus className="h-4 w-4" />
                Thêm gói
              </button>
              <button type="button" className="btn-ghost" onClick={() => void handleRefresh()}>
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </button>
              <input
                className="portal-field min-w-[240px] flex-1"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo mã gói, tên gói, quy tắc tính phí..."
              />
            </div>

            <div className="grid gap-3">
              {filteredPackages.map((servicePackage) => {
                const active = selectedId === servicePackage.id && mode === 'edit';

                return (
                  <div
                    key={servicePackage.id}
                    className={cn(
                      'portal-card-soft grid gap-3 rounded-[22px] p-4 transition',
                      active ? 'border border-emerald-300/25 bg-emerald-400/10' : '',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(servicePackage.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {servicePackage.packageCode}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          {servicePackage.name}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {servicePackage.shortDescription || 'Chưa có mô tả ngắn cho gói này.'}
                        </p>
                      </button>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-semibold',
                            servicePackage.isActive
                              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                              : 'border-white/10 bg-white/5 text-slate-300',
                          )}
                        >
                          {servicePackage.isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                          {modelLabel(servicePackage.contractType)}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p>
                        Đơn giá:{' '}
                        {servicePackage.pricePerKwh != null
                          ? `${formatCurrency(servicePackage.pricePerKwh)} / kWh`
                          : 'Chưa cấu hình'}
                      </p>
                      <p>VAT mặc định: {formatNumber(servicePackage.vatRate || 0, '%')}</p>
                      <p>
                        Thời hạn mặc định:{' '}
                        {servicePackage.defaultTermMonths
                          ? `${formatNumber(servicePackage.defaultTermMonths)} tháng`
                          : 'Theo hợp đồng'}
                      </p>
                            <p>Quy tắc tính phí: {servicePackage.billingRule || 'Chưa cấu hình'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => startEdit(servicePackage.id)}
                      >
                        <PencilLine className="h-4 w-4" />
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void handleToggleActive(servicePackage)}
                        disabled={saving}
                      >
                        <Power className="h-4 w-4" />
                        {servicePackage.isActive ? 'Tạm ngưng' : 'Kích hoạt'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filteredPackages.length ? (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Chưa có gói dịch vụ nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={mode === 'create' ? 'Tạo gói dịch vụ mới' : 'Chi tiết gói dịch vụ'}
          eyebrow="Lưu thật vào hệ thống và dùng lại cho contract/billing"
          dark
        >
          <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Mã gói</span>
                <input
                  className="portal-field"
                  value={form.packageCode}
                  onChange={(event) => updateField('packageCode', event.target.value.toUpperCase())}
                  placeholder="Ví dụ: PPA-2500"
                />
                {fieldErrors.packageCode ? (
                  <span className="text-xs text-rose-300">{fieldErrors.packageCode}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tên gói</span>
                <input
                  className="portal-field"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Ví dụ: Moka PPA 2500"
                />
                {fieldErrors.name ? (
                  <span className="text-xs text-rose-300">{fieldErrors.name}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Loại mô hình</span>
                <select
                  className="portal-field"
                  value={form.contractType}
                  onChange={(event) => updateField('contractType', event.target.value)}
                >
                  {contractTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Trạng thái</span>
                <select
                  className="portal-field"
                  value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(event) => updateField('isActive', event.target.value === 'ACTIVE')}
                >
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Tạm ngưng</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Mô tả ngắn</span>
              <textarea
                className="portal-field min-h-[96px]"
                value={form.shortDescription}
                onChange={(event) => updateField('shortDescription', event.target.value)}
                placeholder="Mô tả ngắn cho sales, contract và customer portal."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Đơn giá</span>
                <input
                  className="portal-field"
                  value={form.pricePerKwh}
                  onChange={(event) => updateField('pricePerKwh', event.target.value)}
                  inputMode="decimal"
                  placeholder="2500"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>VAT mặc định %</span>
                <input
                  className="portal-field"
                  value={form.vatRate}
                  onChange={(event) => updateField('vatRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="8"
                />
                {fieldErrors.vatRate ? (
                  <span className="text-xs text-rose-300">{fieldErrors.vatRate}</span>
                ) : null}
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Thời hạn mặc định (tháng)</span>
                <input
                  className="portal-field"
                  value={form.defaultTermMonths}
                  onChange={(event) => updateField('defaultTermMonths', event.target.value)}
                  inputMode="numeric"
                  placeholder="36"
                />
                {fieldErrors.defaultTermMonths ? (
                  <span className="text-xs text-rose-300">{fieldErrors.defaultTermMonths}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Phí cố định / tháng</span>
                <input
                  className="portal-field"
                  value={form.fixedMonthlyFee}
                  onChange={(event) => updateField('fixedMonthlyFee', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Phí bảo trì</span>
                <input
                  className="portal-field"
                  value={form.maintenanceFee}
                  onChange={(event) => updateField('maintenanceFee', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tăng giá hằng năm %</span>
                <input
                  className="portal-field"
                  value={form.annualEscalationRate}
                  onChange={(event) => updateField('annualEscalationRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Late fee %</span>
                <input
                  className="portal-field"
                  value={form.lateFeeRate}
                  onChange={(event) => updateField('lateFeeRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Early discount %</span>
                <input
                  className="portal-field"
                  value={form.earlyDiscountRate}
                  onChange={(event) => updateField('earlyDiscountRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                    <span>Quy tắc tính phí</span>
                <input
                  className="portal-field"
                  value={form.billingRule}
                  onChange={(event) => updateField('billingRule', event.target.value)}
                  placeholder="PV_MONTHLY_GENERATION"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Ghi chú</span>
              <textarea
                className="portal-field min-h-[120px]"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Ghi chú nội bộ cho vận hành hoặc sales."
              />
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

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : mode === 'create' ? 'Tạo gói dịch vụ' : 'Lưu thay đổi'}
              </button>
              {mode === 'edit' ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setMode('create');
                    startCreate();
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Tạo bản mới
                </button>
              ) : null}
              {mode === 'edit' && selectedPackage ? (
                <button
                  type="button"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                  disabled={saving}
                  onClick={() => void handleArchive()}
                >
                  <Trash2 className="h-4 w-4" />
                  Lưu trữ gói
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
