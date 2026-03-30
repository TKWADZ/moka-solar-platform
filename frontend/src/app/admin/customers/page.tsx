'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { MonthlyPvBillingTable } from '@/components/monthly-pv-billing-table';
import { SectionCard } from '@/components/section-card';
import {
  createCustomerRequest,
  deleteCustomerRequest,
  listCustomersRequest,
  listMonthlyPvBillingsRequest,
  listUsersRequest,
  updateCustomerRequest,
} from '@/lib/api';
import { cn, formatCurrency, formatDateTime, formatMonthPeriod, formatNumber } from '@/lib/utils';
import { CustomerRecord, CustomerStatus, MonthlyPvBillingRecord, UserRecord } from '@/types';

type CustomerFormState = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  companyName: string;
  installationAddress: string;
  billingAddress: string;
  notes: string;
  defaultUnitPrice: string;
  defaultTaxAmount: string;
  defaultDiscountAmount: string;
  status: CustomerStatus;
  ownerUserId: string;
};

type FieldErrors = Partial<Record<keyof CustomerFormState, string>>;

const customerStatusOptions: Array<{ value: CustomerStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'ONBOARDING', label: 'Đang onboarding' },
  { value: 'ON_HOLD', label: 'Tạm giữ' },
  { value: 'INACTIVE', label: 'Ngưng hoạt động' },
];

function emptyForm(): CustomerFormState {
  return {
    fullName: '',
    email: '',
    password: '',
    phone: '',
    companyName: '',
    installationAddress: '',
    billingAddress: '',
    notes: '',
    defaultUnitPrice: '',
    defaultTaxAmount: '',
    defaultDiscountAmount: '',
    status: 'ACTIVE',
    ownerUserId: '',
  };
}

function buildForm(customer: CustomerRecord | null): CustomerFormState {
  if (!customer) {
    return emptyForm();
  }

  return {
    fullName: customer.user.fullName || '',
    email: customer.user.email || '',
    password: '',
    phone: customer.user.phone || '',
    companyName: customer.companyName || '',
    installationAddress: customer.installationAddress || '',
    billingAddress: customer.billingAddress || '',
    notes: customer.notes || '',
    defaultUnitPrice:
      customer.defaultUnitPrice !== null && customer.defaultUnitPrice !== undefined
        ? String(customer.defaultUnitPrice)
        : '',
    defaultTaxAmount:
      customer.defaultVatRate !== null && customer.defaultVatRate !== undefined
        ? String(customer.defaultVatRate)
        : '',
    defaultDiscountAmount:
      customer.defaultDiscountAmount !== null && customer.defaultDiscountAmount !== undefined
        ? String(customer.defaultDiscountAmount)
        : '',
    status: customer.status || 'ACTIVE',
    ownerUserId: customer.ownerUser?.id || '',
  };
}

function generateTemporaryPassword() {
  return `Moka#${Math.random().toString(36).slice(2, 10)}A1`;
}

function totalBilled(customer: CustomerRecord) {
  return (customer.invoices || []).reduce(
    (sum, invoice) => sum + Number(invoice.totalAmount || 0),
    0,
  );
}

function statusLabel(status: CustomerStatus) {
  return (
    customerStatusOptions.find((item) => item.value === status)?.label || status
  );
}

function validateForm(form: CustomerFormState, mode: 'create' | 'edit') {
  const errors: FieldErrors = {};

  if (!form.fullName.trim()) {
    errors.fullName = 'Vui lòng nhập họ tên khách hàng.';
  }

  if (!form.email.trim()) {
    errors.email = 'Vui lòng nhập email đăng nhập.';
  } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Email chưa đúng định dạng.';
  }

  if (mode === 'create' && form.password.trim() && form.password.trim().length < 6) {
    errors.password = 'Mật khẩu cần tối thiểu 6 ký tự.';
  }

  if (form.phone.trim() && form.phone.trim().length < 8) {
    errors.phone = 'Số điện thoại chưa hợp lệ.';
  }

  if (form.defaultUnitPrice.trim() && Number(form.defaultUnitPrice) < 0) {
    errors.defaultUnitPrice = 'Đơn giá mặc định không hợp lệ.';
  }

  if (form.defaultTaxAmount.trim() && (Number(form.defaultTaxAmount) < 0 || Number(form.defaultTaxAmount) > 100)) {
    errors.defaultTaxAmount = 'Thuế mặc định không hợp lệ.';
  }

  if (form.defaultDiscountAmount.trim() && Number(form.defaultDiscountAmount) < 0) {
    errors.defaultDiscountAmount = 'Chiết khấu mặc định không hợp lệ.';
  }

  return errors;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [owners, setOwners] = useState<UserRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CustomerFormState>(emptyForm());
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyPvBillingRecord[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [credentialsNotice, setCredentialsNotice] = useState('');
  const [monthlyError, setMonthlyError] = useState('');

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || null,
    [customers, selectedId],
  );

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return customers;
    }

    return customers.filter((customer) =>
      [
        customer.customerCode,
        customer.companyName,
        customer.user.fullName,
        customer.user.email,
        customer.installationAddress,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [customers, search]);

  const customerMonthlySummary = useMemo(() => {
    const totalPv = monthlyRecords.reduce((sum, record) => sum + record.pvGenerationKwh, 0);
    const totalAmount = monthlyRecords.reduce((sum, record) => sum + record.totalAmount, 0);

    return {
      totalPv,
      totalAmount,
      latestPeriod: monthlyRecords[0]
        ? formatMonthPeriod(monthlyRecords[0].month, monthlyRecords[0].year)
        : 'Chưa có',
    };
  }, [monthlyRecords]);

  async function loadData(nextSelectedId?: string) {
    const [nextCustomers, nextUsers] = await Promise.all([
      listCustomersRequest(),
      listUsersRequest(),
    ]);

    const nextOwners = nextUsers.filter((user) =>
      ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(user.role?.code || ''),
    );

    setCustomers(nextCustomers);
    setOwners(nextOwners);

    const fallbackId = nextSelectedId || nextCustomers[0]?.id || '';
    setSelectedId(fallbackId);

    const fallbackCustomer = nextCustomers.find((item) => item.id === fallbackId) || null;
    if (mode === 'edit') {
      setForm(buildForm(fallbackCustomer));
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Không thể tải danh mục khách hàng.',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildForm(selectedCustomer));
      setFieldErrors({});
    }
  }, [mode, selectedCustomer]);

  useEffect(() => {
    if (mode !== 'edit' || !selectedCustomer) {
      setMonthlyRecords([]);
      setMonthlyError('');
      return;
    }

    let active = true;
    setMonthlyLoading(true);
    setMonthlyError('');

    listMonthlyPvBillingsRequest({ customerId: selectedCustomer.id })
      .then((records) => {
        if (!active) return;
        setMonthlyRecords(records);
      })
      .catch((nextError) => {
        if (!active) return;
        setMonthlyError(
          nextError instanceof Error
            ? nextError.message
            : 'Không thể tải sản lượng PV theo tháng của khách hàng.',
        );
        setMonthlyRecords([]);
      })
      .finally(() => {
        if (active) {
          setMonthlyLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedCustomer?.id]);

  function updateField<K extends keyof CustomerFormState>(
    key: K,
    value: CustomerFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleStartCreate() {
    setMode('create');
    setSelectedId('');
    setForm(emptyForm());
    setFieldErrors({});
    setMessage('');
    setError('');
    setCredentialsNotice('');
  }

  function handleStartEdit(customerId: string) {
    setMode('edit');
    setSelectedId(customerId);
    setFieldErrors({});
    setMessage('');
    setError('');
    setCredentialsNotice('');
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await loadData(selectedId);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải lại danh mục khách hàng.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    setCredentialsNotice('');

    const nextErrors = validateForm(form, mode);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Vui lòng kiểm tra lại các trường đang được đánh dấu.');
      return;
    }

    setSaving(true);

    const passwordToUse =
      mode === 'create'
        ? form.password.trim() || generateTemporaryPassword()
        : form.password.trim();

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      ...(passwordToUse ? { password: passwordToUse } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.companyName.trim() ? { companyName: form.companyName.trim() } : {}),
      ...(form.installationAddress.trim()
        ? { installationAddress: form.installationAddress.trim() }
        : {}),
      ...(form.billingAddress.trim()
        ? { billingAddress: form.billingAddress.trim() }
        : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(form.defaultUnitPrice.trim()
        ? { defaultUnitPrice: Number(form.defaultUnitPrice) }
        : {}),
      ...(form.defaultTaxAmount.trim()
        ? { defaultVatRate: Number(form.defaultTaxAmount) }
        : {}),
      ...(form.defaultDiscountAmount.trim()
        ? { defaultDiscountAmount: Number(form.defaultDiscountAmount) }
        : {}),
      status: form.status,
      ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
    };

    try {
      if (mode === 'create') {
        const created = await createCustomerRequest(payload);
        await loadData(created.id);
        setMode('edit');
        setMessage('Đã tạo khách hàng và tài khoản đăng nhập thành công.');
        setCredentialsNotice(
          `Email đăng nhập: ${payload.email} | Mật khẩu tạm: ${passwordToUse}`,
        );
      } else if (selectedCustomer) {
        const updated = await updateCustomerRequest(selectedCustomer.id, payload);
        await loadData(updated.id);
        setMessage('Đã cập nhật thông tin khách hàng.');
        if (passwordToUse) {
          setCredentialsNotice(
            `Đã đặt lại mật khẩu cho ${updated.user.email}. Mật khẩu mới: ${passwordToUse}`,
          );
        }
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể lưu thông tin khách hàng.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedCustomer) {
      return;
    }

    const confirmed = window.confirm(
      `Lưu trữ khách hàng "${selectedCustomer.companyName || selectedCustomer.user.fullName}"?`,
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await deleteCustomerRequest(selectedCustomer.id);
      await loadData();
      setMode('edit');
      setMessage('Đã lưu trữ khách hàng.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể lưu trữ khách hàng.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Quản lý khách hàng" eyebrow="CRM và hồ sơ khách hàng" dark>
        <p className="text-sm text-slate-300">Đang tải danh mục khách hàng...</p>
      </SectionCard>
    );
  }

  const activeSystems = customers.reduce(
    (total, customer) => total + (customer.solarSystems?.length || 0),
    0,
  );
  const totalInvoiceValue = customers.reduce(
    (total, customer) => total + totalBilled(customer),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Khách hàng đang quản lý</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(customers.length)}</p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Hệ thống đang gắn</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(activeSystems)}</p>
        </div>
        <div className="portal-card min-w-0 p-5">
          <p className="text-sm text-slate-400">Giá trị đã phát hành</p>
          <p className="mt-3 break-words text-3xl font-semibold text-white">
            {formatCurrency(totalInvoiceValue)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SectionCard title="Danh mục khách hàng" eyebrow="Tài khoản, trạng thái và người phụ trách" dark>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={handleStartCreate}>
                <Plus className="h-4 w-4" />
                Tạo khách hàng
              </button>
              <button type="button" className="btn-ghost" onClick={() => void handleRefresh()}>
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
                placeholder="Tên khách, email, mã khách hàng, địa chỉ..."
              />
            </label>

            <div className="space-y-3">
              {filteredCustomers.length ? (
                filteredCustomers.map((customer) => {
                  const selected = mode === 'edit' && selectedId === customer.id;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleStartEdit(customer.id)}
                      className={cn(
                        'w-full rounded-[24px] border px-4 py-4 text-left transition',
                        selected
                          ? 'border-white/20 bg-white text-slate-950'
                          : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">
                            {customer.companyName || customer.user.fullName}
                          </p>
                          <p className={cn('mt-1 text-sm', selected ? 'text-slate-600' : 'text-slate-400')}>
                            {customer.user.email}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold',
                            selected ? 'bg-slate-950 text-white' : 'bg-emerald-400/15 text-emerald-300',
                          )}
                        >
                          {customer.customerCode}
                        </span>
                      </div>

                      <div
                        className={cn(
                          'mt-4 grid gap-2 text-sm sm:grid-cols-2',
                          selected ? 'text-slate-700' : 'text-slate-300',
                        )}
                      >
                        <p>Trạng thái: {statusLabel(customer.status)}</p>
                        <p>Người phụ trách: {customer.ownerUser?.fullName || 'Chưa gán'}</p>
                        <p>Hệ thống: {formatNumber(customer.solarSystems?.length || 0)}</p>
                        <p>Đã xuất: {formatCurrency(totalBilled(customer))}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Không có khách hàng nào khớp với bộ lọc hiện tại.
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={mode === 'create' ? 'Tạo khách hàng mới' : 'Chỉnh sửa khách hàng'}
          eyebrow={mode === 'create' ? 'Tạo hồ sơ và tài khoản đăng nhập' : 'Cập nhật hồ sơ, trạng thái và ghi chú'}
          dark
        >
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Họ và tên</span>
                <input
                  className={cn('portal-field', fieldErrors.fullName && 'border-rose-300/40')}
                  value={form.fullName}
                  onChange={(event) => updateField('fullName', event.target.value)}
                />
                {fieldErrors.fullName ? <span className="text-xs text-rose-300">{fieldErrors.fullName}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Email</span>
                <input
                  type="email"
                  className={cn('portal-field', fieldErrors.email && 'border-rose-300/40')}
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                />
                {fieldErrors.email ? <span className="text-xs text-rose-300">{fieldErrors.email}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{mode === 'create' ? 'Mật khẩu' : 'Đặt lại mật khẩu'}</span>
                <input
                  type="text"
                  className={cn('portal-field', fieldErrors.password && 'border-rose-300/40')}
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder={
                    mode === 'create'
                      ? 'Để trống nếu muốn hệ thống tự tạo mật khẩu tạm'
                      : 'Để trống nếu giữ nguyên mật khẩu hiện tại'
                  }
                />
                {fieldErrors.password ? <span className="text-xs text-rose-300">{fieldErrors.password}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Số điện thoại</span>
                <input
                  className={cn('portal-field', fieldErrors.phone && 'border-rose-300/40')}
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                />
                {fieldErrors.phone ? <span className="text-xs text-rose-300">{fieldErrors.phone}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tên công ty</span>
                <input
                  className="portal-field"
                  value={form.companyName}
                  onChange={(event) => updateField('companyName', event.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Trạng thái</span>
                <select
                  className="portal-field"
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value as CustomerStatus)}
                >
                  {customerStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                  placeholder="Ví dụ: 1850"
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
                  placeholder="0 hoặc nhập tiền thuế cố định"
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
                  placeholder="0 nếu không áp dụng"
                />
                {fieldErrors.defaultDiscountAmount ? (
                  <span className="text-xs text-rose-300">{fieldErrors.defaultDiscountAmount}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Người phụ trách</span>
                <select
                  className="portal-field"
                  value={form.ownerUserId}
                  onChange={(event) => updateField('ownerUserId', event.target.value)}
                >
                  <option value="">Chưa gán người phụ trách</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.fullName} - {owner.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Ngày tạo</span>
                <input
                  className="portal-field opacity-80"
                  value={selectedCustomer ? formatDateTime(selectedCustomer.createdAt) : 'Sẽ tạo khi lưu'}
                  readOnly
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Địa chỉ lắp đặt</span>
              <textarea
                className="portal-field min-h-[96px]"
                value={form.installationAddress}
                onChange={(event) => updateField('installationAddress', event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Địa chỉ xuất hóa đơn</span>
              <textarea
                className="portal-field min-h-[96px]"
                value={form.billingAddress}
                onChange={(event) => updateField('billingAddress', event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Ghi chú</span>
              <textarea
                className="portal-field min-h-[110px]"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Thông tin lưu ý cho đội sales / vận hành / chăm sóc khách hàng"
              />
            </label>

            {selectedCustomer && mode === 'edit' ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Mã khách hàng</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {selectedCustomer.customerCode}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Số hóa đơn</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(selectedCustomer.invoices?.length || 0)}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tổng đã xuất</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {formatCurrency(totalBilled(selectedCustomer))}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Đơn giá mặc định</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {formatCurrency(selectedCustomer.defaultUnitPrice || 0)}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Thuế / chiết khấu</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {formatCurrency(selectedCustomer.defaultTaxAmount || 0)} / {formatCurrency(selectedCustomer.defaultDiscountAmount || 0)}
                  </p>
                </div>
              </div>
            ) : null}

            {message ? (
              <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}

            {credentialsNotice ? (
              <div className="rounded-[20px] border border-sky-300/15 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                {credentialsNotice}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving
                  ? 'Đang lưu...'
                  : mode === 'create'
                    ? 'Tạo khách hàng'
                    : 'Lưu thay đổi'}
              </button>

              {mode === 'edit' && selectedCustomer ? (
                <button
                  type="button"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                  disabled={saving}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="h-4 w-4" />
                  Lưu trữ khách hàng
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>

      {selectedCustomer && mode === 'edit' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
          <SectionCard
            title="Chi tiết khách hàng theo hệ thống"
            eyebrow="Hệ thống liên kết và bức tranh vận hành"
            dark
          >
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Hệ thống liên kết</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(selectedCustomer.solarSystems?.length || 0)}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">PV đã ghi nhận</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(customerMonthlySummary.totalPv, 'kWh')}
                  </p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tổng tiền phải thu</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">
                    {formatCurrency(customerMonthlySummary.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="portal-card-soft p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Chu kỳ gần nhất</p>
                    <p className="mt-1 text-sm text-slate-400">{customerMonthlySummary.latestPeriod}</p>
                  </div>
                  <div className="text-sm text-slate-400">
                    Người phụ trách: <span className="text-slate-100">{selectedCustomer.ownerUser?.fullName || 'Chưa gắn'}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {selectedCustomer.solarSystems?.length ? (
                    selectedCustomer.solarSystems.map((system) => (
                      <div key={system.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {system.systemCode}
                            </p>
                            <p className="mt-2 truncate text-base font-semibold text-white">
                              {system.name}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                            {system.status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">
                          Công suất: {formatNumber(system.capacityKwp, 'kWp')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                      Khách hàng này chưa có hệ thống liên kết. Hãy tạo hệ thống và gắn vào khách hàng để bắt đầu đồng bộ PV theo tháng.
                    </div>
                  )}
                </div>
              </div>

              {monthlyError ? (
                <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {monthlyError}
                </div>
              ) : null}
            </div>
          </SectionCard>

          <MonthlyPvBillingTable
            title="Sản lượng PV và số tiền phải thanh toán"
            eyebrow="Tổng hợp theo từng hệ thống và từng tháng"
            records={monthlyRecords}
            showSystem
            emptyTitle="Chưa có dữ liệu PV theo tháng cho khách hàng này"
            emptyBody="Sau khi đồng bộ PV tháng ở từng hệ thống, bảng này sẽ hiển thị sản lượng, đơn giá và tổng tiền phải thanh toán theo từng kỳ."
            className={monthlyLoading ? 'opacity-80' : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
