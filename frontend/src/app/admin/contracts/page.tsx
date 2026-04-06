'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileText, PencilLine, Plus, Trash2 } from 'lucide-react';
import { EntityActivityPanel } from '@/components/entity-activity-panel';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  createContractRequest,
  deleteContractRequest,
  listAdminSystemsRequest,
  listContractsRequest,
  listCustomersRequest,
  listServicePackagesRequest,
  updateContractRequest,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  AdminSystemRecord,
  ContractRecord,
  CustomerRecord,
  ServicePackageRecord,
  StatCardItem,
} from '@/types';

type ContractFormState = {
  customerId: string;
  solarSystemId: string;
  servicePackageId: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  termMonths: string;
  pricePerKwh: string;
  fixedMonthlyFee: string;
  interestRate: string;
  vatRate: string;
  contractFileUrl: string;
};

const emptyForm: ContractFormState = {
  customerId: '',
  solarSystemId: '',
  servicePackageId: '',
  type: 'PPA_KWH',
  status: 'ACTIVE',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  termMonths: '',
  pricePerKwh: '',
  fixedMonthlyFee: '',
  interestRate: '',
  vatRate: '8',
  contractFileUrl: '',
};

const contractTypeOptions = [
  { value: 'PPA_KWH', label: 'Bán điện theo kWh' },
  { value: 'LEASE', label: 'Thuê hệ thống' },
  { value: 'INSTALLMENT', label: 'Trả góp' },
  { value: 'HYBRID', label: 'Mô hình kết hợp' },
  { value: 'SALE', label: 'Mua đứt' },
];

const contractStatusOptions = [
  { value: 'ACTIVE', label: 'Đang hiệu lực' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'TERMINATED', label: 'Đã chấm dứt' },
];

function pricingLabel(contract: ContractRecord) {
  if (contract.type === 'PPA_KWH') {
    return `${formatCurrency(
      Number(contract.pricePerKwh || contract.servicePackage?.pricePerKwh || 0),
    )} / kWh`;
  }

  if (contract.type === 'LEASE') {
    return `${formatCurrency(
      Number(contract.fixedMonthlyFee || contract.servicePackage?.fixedMonthlyFee || 0),
    )} / tháng`;
  }

  if (contract.type === 'HYBRID') {
    return `${formatCurrency(Number(contract.fixedMonthlyFee || 0))} + ${formatCurrency(
      Number(contract.pricePerKwh || 0),
    )}/kWh`;
  }

  if (contract.type === 'INSTALLMENT') {
    return `${formatCurrency(Number(contract.fixedMonthlyFee || 0))} / tháng`;
  }

  return formatCurrency(Number(contract.fixedMonthlyFee || 0));
}

function typeLabel(type: string) {
  return contractTypeOptions.find((item) => item.value === type)?.label || type;
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function toForm(contract: ContractRecord): ContractFormState {
  return {
    customerId: contract.customer?.id || '',
    solarSystemId: contract.solarSystem?.id || '',
    servicePackageId: contract.servicePackage?.id || '',
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate.slice(0, 10),
    endDate: contract.endDate ? contract.endDate.slice(0, 10) : '',
    termMonths: contract.termMonths != null ? String(contract.termMonths) : '',
    pricePerKwh: contract.pricePerKwh != null ? String(contract.pricePerKwh) : '',
    fixedMonthlyFee: contract.fixedMonthlyFee != null ? String(contract.fixedMonthlyFee) : '',
    interestRate: contract.interestRate != null ? String(contract.interestRate) : '',
    vatRate: contract.vatRate != null ? String(contract.vatRate) : '',
    contractFileUrl: contract.contractFileUrl || '',
  };
}

export default function AdminContractsPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [servicePackages, setServicePackages] = useState<ServicePackageRecord[]>([]);
  const [form, setForm] = useState<ContractFormState>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    const [nextContracts, nextCustomers, nextSystems, nextServicePackages] = await Promise.all([
      listContractsRequest(),
      listCustomersRequest(),
      listAdminSystemsRequest(),
      listServicePackagesRequest(),
    ]);

    setContracts(nextContracts);
    setCustomers(nextCustomers);
    setSystems(nextSystems);
    setServicePackages(nextServicePackages);
  }

  useEffect(() => {
    loadData()
      .catch((requestError) =>
        setError(
          requestError instanceof Error ? requestError.message : 'Không thể tải dữ liệu hợp đồng.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const availableSystems = useMemo(() => {
    return systems.filter(
      (system) =>
        !form.customerId ||
        system.customer?.id === form.customerId ||
        system.id === form.solarSystemId,
    );
  }, [form.customerId, form.solarSystemId, systems]);

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract.id === editingId) || contracts[0] || null,
    [contracts, editingId],
  );

  const stats = useMemo<StatCardItem[]>(() => {
    const activeContracts = contracts.filter((contract) => contract.status === 'ACTIVE').length;
    const ppaContracts = contracts.filter((contract) => contract.type === 'PPA_KWH').length;
    const expiringSoon = contracts.filter((contract) => {
      if (!contract.endDate) {
        return false;
      }

      const diff =
        new Date(contract.endDate).getTime() - new Date().getTime();
      return diff > 0 && diff <= 1000 * 60 * 60 * 24 * 90;
    }).length;

    return [
      {
        title: 'Hợp đồng đang hiệu lực',
        value: String(activeContracts),
        subtitle: 'Danh mục điều khoản đang áp dụng cho khách hàng.',
        delta: ppaContracts ? `${ppaContracts} hợp đồng PPA` : 'Chưa có PPA',
        trend: 'up',
      },
      {
        title: 'Sắp cần gia hạn',
        value: String(expiringSoon),
        subtitle: 'Các hợp đồng có ngày kết thúc trong 90 ngày tới.',
        delta: expiringSoon ? 'Cần rà soát phụ lục' : 'Danh mục ổn định',
        trend: expiringSoon ? 'neutral' : 'up',
      },
    ];
  }, [contracts]);

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  function handlePackageChange(servicePackageId: string) {
    const selectedPackage = servicePackages.find((item) => item.id === servicePackageId);

    setForm((current) => ({
      ...current,
      servicePackageId,
      type: selectedPackage?.contractType || current.type,
      pricePerKwh:
        current.pricePerKwh || selectedPackage?.pricePerKwh != null
          ? String(
              selectedPackage?.pricePerKwh != null
                ? selectedPackage.pricePerKwh
                : current.pricePerKwh,
            )
          : current.pricePerKwh,
      fixedMonthlyFee:
        current.fixedMonthlyFee || selectedPackage?.fixedMonthlyFee != null
          ? String(
              selectedPackage?.fixedMonthlyFee != null
                ? selectedPackage.fixedMonthlyFee
                : current.fixedMonthlyFee,
            )
          : current.fixedMonthlyFee,
      vatRate:
        current.vatRate || selectedPackage?.vatRate != null
          ? String(selectedPackage?.vatRate != null ? selectedPackage.vatRate : current.vatRate)
          : current.vatRate,
    }));
  }

  async function handleSubmit() {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        customerId: form.customerId,
        solarSystemId: form.solarSystemId,
        servicePackageId: form.servicePackageId,
        type: form.type,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        termMonths: parseOptionalNumber(form.termMonths),
        pricePerKwh: parseOptionalNumber(form.pricePerKwh),
        fixedMonthlyFee: parseOptionalNumber(form.fixedMonthlyFee),
        interestRate: parseOptionalNumber(form.interestRate),
        vatRate: parseOptionalNumber(form.vatRate),
        contractFileUrl: form.contractFileUrl.trim() || undefined,
      };

      if (!payload.customerId || !payload.solarSystemId || !payload.servicePackageId) {
        throw new Error('Vui lòng chọn khách hàng, hệ thống và gói dịch vụ.');
      }

      if (editingId) {
        await updateContractRequest(editingId, payload);
        setMessage('Đã cập nhật hợp đồng.');
      } else {
        await createContractRequest(payload);
        setMessage('Đã tạo hợp đồng mới.');
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể lưu hợp đồng.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contractId: string) {
    const confirmed = window.confirm('Bạn có chắc muốn lưu trữ hợp đồng này không?');
    if (!confirmed) {
      return;
    }

    setMessage('');
    setError('');

    try {
      await deleteContractRequest(contractId);
      if (editingId === contractId) {
        resetForm();
      }
      await loadData();
      setMessage('Đã lưu trữ hợp đồng.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể lưu trữ hợp đồng.',
      );
    }
  }

  if (loading) {
    return (
      <SectionCard title="Danh mục hợp đồng" eyebrow="Hồ sơ thương mại" dark>
        <p className="text-sm text-slate-300">Đang tải hợp đồng...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <SectionCard
        title={editingId ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng mới'}
        eyebrow="Gắn đúng khách hàng, hệ thống, gói dịch vụ và cấu trúc giá"
        dark
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>Khách hàng</span>
            <select
              className="portal-field"
              value={form.customerId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  customerId: event.target.value,
                  solarSystemId: '',
                }))
              }
            >
              <option value="">Chọn khách hàng</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName || customer.user.fullName} - {customer.customerCode}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Hệ thống / site</span>
            <select
              className="portal-field"
              value={form.solarSystemId}
              onChange={(event) =>
                setForm((current) => ({ ...current, solarSystemId: event.target.value }))
              }
            >
              <option value="">Chọn hệ thống</option>
              {availableSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.systemCode} - {system.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Gói dịch vụ</span>
            <select
              className="portal-field"
              value={form.servicePackageId}
              onChange={(event) => handlePackageChange(event.target.value)}
            >
              <option value="">Chọn gói dịch vụ</option>
              {servicePackages.map((servicePackage) => (
                <option key={servicePackage.id} value={servicePackage.id}>
                  {servicePackage.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Mô hình hợp đồng</span>
            <select
              className="portal-field"
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
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
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value }))
              }
            >
              {contractStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>URL PDF / phụ lục</span>
            <input
              className="portal-field"
              value={form.contractFileUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, contractFileUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Ngày bắt đầu</span>
            <input
              type="date"
              className="portal-field"
              value={form.startDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Ngày kết thúc</span>
            <input
              type="date"
              className="portal-field"
              value={form.endDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, endDate: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Thời hạn (tháng)</span>
            <input
              type="number"
              min="1"
              className="portal-field"
              value={form.termMonths}
              onChange={(event) =>
                setForm((current) => ({ ...current, termMonths: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Đơn giá điện (đ/kWh)</span>
            <input
              type="number"
              min="0"
              className="portal-field"
              value={form.pricePerKwh}
              onChange={(event) =>
                setForm((current) => ({ ...current, pricePerKwh: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Phí cố định / tháng</span>
            <input
              type="number"
              min="0"
              className="portal-field"
              value={form.fixedMonthlyFee}
              onChange={(event) =>
                setForm((current) => ({ ...current, fixedMonthlyFee: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Lãi suất (%)</span>
            <input
              type="number"
              min="0"
              className="portal-field"
              value={form.interestRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, interestRate: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>VAT (%)</span>
            <input
              type="number"
              min="0"
              className="portal-field"
              value={form.vatRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, vatRate: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSubmit()}>
            <Plus className="h-4 w-4" />
            {saving ? 'Đang lưu...' : editingId ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng'}
          </button>
          {editingId ? (
            <button type="button" className="btn-ghost" onClick={resetForm}>
              Hủy chỉnh sửa
            </button>
          ) : null}
        </div>

        {message ? (
          <div className="mt-4 rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Danh mục hợp đồng"
        eyebrow="Điều khoản thương mại, kỳ hạn và tài liệu đính kèm"
        dark
      >
        <div className="grid gap-4">
          {contracts.length ? (
            contracts.map((contract) => (
              <div key={contract.id} className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {contract.contractNumber}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {contract.customer?.companyName || contract.customer?.user?.fullName || 'Khách hàng chưa đặt tên'}
                    </h3>
                    <p className="mt-2 text-sm text-slate-400">
                      {contract.solarSystem?.name || '-'} • {typeLabel(contract.type)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusPill label={contract.status} />
                    <StatusPill label={typeLabel(contract.type)} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                  <p>Thời hạn: {contract.termMonths ? `${contract.termMonths} tháng` : '-'}</p>
                  <p>Ngày bắt đầu: {formatDate(contract.startDate)}</p>
                  <p>Ngày kết thúc: {contract.endDate ? formatDate(contract.endDate) : '-'}</p>
                  <p>Đơn giá: {pricingLabel(contract)}</p>
                  <p>VAT: {contract.vatRate != null ? `${contract.vatRate}%` : '-'}</p>
                  <p>Gói dịch vụ: {contract.servicePackage?.name || '-'}</p>
                  <p>Mã hệ thống: {contract.solarSystem?.systemCode || '-'}</p>
                  <p>Email portal: {contract.customer?.user?.email || '-'}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setEditingId(contract.id);
                      setForm(toForm(contract));
                    }}
                  >
                    <PencilLine className="h-4 w-4" />
                    Chỉnh sửa
                  </button>

                  <button
                    type="button"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                    onClick={() => void handleDelete(contract.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Lưu trữ
                  </button>

                  {contract.contractFileUrl ? (
                    <Link
                      href={contract.contractFileUrl}
                      target="_blank"
                      className="btn-ghost inline-flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Mở PDF / phụ lục
                    </Link>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chưa có hợp đồng nào trong danh mục</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Hãy tạo hợp đồng mới để gắn khách hàng, hệ thống và cấu trúc giá trước khi phát hành hóa đơn.
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      <EntityActivityPanel
        entityType="Contract"
        entityId={selectedContract?.id}
        moduleKey="contracts"
        title="Contract activity timeline"
        eyebrow="Lịch sử cập nhật điều khoản, phân công và ghi chú nội bộ"
        emptyMessage="Hợp đồng này chưa có thêm hoạt động nào được ghi lại."
      />
    </div>
  );
}
