'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Link2, Link2Off, RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  getCustomerRequest,
  listAdminSystemsRequest,
  updateSystemRequest,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AdminSystemRecord, CustomerRecord } from '@/types';

type CustomerDetailTab = 'overview' | 'systems' | 'contracts' | 'billing';

const tabOptions: Array<{ value: CustomerDetailTab; label: string }> = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'systems', label: 'Hệ thống' },
  { value: 'contracts', label: 'Hợp đồng' },
  { value: 'billing', label: 'Billing & công nợ' },
];

function systemStatusLabel(status?: string | null) {
  switch (status) {
    case 'ACTIVE':
      return 'Đang hoạt động';
    case 'MAINTENANCE':
      return 'Đang bảo trì';
    case 'WARNING':
      return 'Cảnh báo';
    case 'FAULT':
      return 'Lỗi';
    case 'OFFLINE':
      return 'Mất kết nối';
    case 'INSTALLING':
      return 'Đang lắp đặt';
    case 'PLANNING':
      return 'Lên kế hoạch';
    default:
      return status || 'Chưa rõ';
  }
}

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [tab, setTab] = useState<CustomerDetailTab>('overview');
  const [loading, setLoading] = useState(true);
  const [savingSystemId, setSavingSystemId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const linkedSystems = useMemo(
    () => systems.filter((system) => system.customer?.id === customerId),
    [customerId, systems],
  );

  const availableSystems = useMemo(
    () =>
      systems.filter(
        (system) =>
          !system.customer?.id || system.customer.id === customerId,
      ),
    [customerId, systems],
  );

  async function loadData() {
    if (!customerId) {
      return;
    }

    const [nextCustomer, nextSystems] = await Promise.all([
      getCustomerRequest(customerId),
      listAdminSystemsRequest(),
    ]);

    setCustomer(nextCustomer);
    setSystems(nextSystems);
  }

  useEffect(() => {
    loadData()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải hồ sơ khách hàng.',
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleLinkSystem(system: AdminSystemRecord) {
    if (!customerId) {
      return;
    }

    setSavingSystemId(system.id);
    setMessage('');
    setError('');

    try {
      await updateSystemRequest(system.id, {
        customerId,
      });
      await loadData();
      setMessage(`Đã gắn hệ thống ${system.name} vào khách hàng này.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể gắn hệ thống.',
      );
    } finally {
      setSavingSystemId('');
    }
  }

  async function handleUnlinkSystem(system: AdminSystemRecord) {
    setSavingSystemId(system.id);
    setMessage('');
    setError('');

    try {
      await updateSystemRequest(system.id, {
        customerId: '',
      });
      await loadData();
      setMessage(`Đã gỡ hệ thống ${system.name} khỏi khách hàng này.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể gỡ hệ thống.',
      );
    } finally {
      setSavingSystemId('');
    }
  }

  if (loading) {
    return (
      <SectionCard title="Hồ sơ khách hàng" eyebrow="Đang tải dữ liệu" dark>
        <p className="text-sm text-slate-300">Đang tải thông tin khách hàng...</p>
      </SectionCard>
    );
  }

  if (!customer) {
    return (
      <SectionCard title="Hồ sơ khách hàng" eyebrow="Không tìm thấy dữ liệu" dark>
        <p className="text-sm text-rose-300">{error || 'Không tìm thấy khách hàng.'}</p>
      </SectionCard>
    );
  }

  const unpaidInvoices = (customer.invoices || []).filter(
    (invoice) => !['PAID', 'CANCELLED'].includes(invoice.status),
  );
  const totalDebt = unpaidInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);

  return (
    <div className="space-y-5">
      <SectionCard
        title={customer.companyName || customer.user.fullName}
        eyebrow={`${customer.customerCode} · Công ty TNHH Truyền thông Moka`}
        dark
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Email đăng nhập</p>
              <p className="mt-2 text-base font-semibold text-white">{customer.user.email}</p>
            </div>
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Người phụ trách</p>
              <p className="mt-2 text-base font-semibold text-white">
                {customer.ownerUser?.fullName || 'Chưa gán'}
              </p>
            </div>
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Địa chỉ lắp đặt</p>
              <p className="mt-2 text-base font-semibold text-white">
                {customer.installationAddress || 'Chưa cập nhật'}
              </p>
            </div>
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Địa chỉ xuất hóa đơn</p>
              <p className="mt-2 text-base font-semibold text-white">
                {customer.billingAddress || 'Chưa cập nhật'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Số hệ thống đang gắn</p>
              <p className="mt-2 text-2xl font-semibold text-white">{linkedSystems.length}</p>
            </div>
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Hợp đồng hiện hữu</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {(customer.contracts || []).length}
              </p>
            </div>
            <div className="portal-card-soft p-4">
              <p className="text-sm text-slate-400">Dư nợ hiện tại</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalDebt)}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/customers" className="btn-ghost">
            Quay lại danh sách khách hàng
          </Link>
          <button type="button" className="btn-ghost" onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4" />
            Tải lại chi tiết
          </button>
        </div>
      </SectionCard>

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
        {tabOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === option.value
                ? 'bg-white text-slate-950'
                : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard title="Tổng quan hệ thống" eyebrow="Tài sản đang gắn với khách" dark>
            <div className="grid gap-3">
              {linkedSystems.length ? (
                linkedSystems.map((system) => (
                  <div key={system.id} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {system.systemCode}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{system.name}</h3>
                        <p className="mt-2 text-sm text-slate-300">
                          {systemStatusLabel(system.status)} · {system.monitoringProvider || 'Manual'}
                        </p>
                      </div>
                      <Link href="/admin/systems" className="btn-ghost">
                        Mở system
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Khách hàng này chưa có system nào được gắn.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Hợp đồng và hóa đơn" eyebrow="Tổng hợp nhanh theo khách hàng" dark>
            <div className="grid gap-3">
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Hợp đồng đang hiệu lực</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {(customer.contracts || []).filter((contract) => contract.status === 'ACTIVE').length}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Hóa đơn quá hạn</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {unpaidInvoices.filter((invoice) => invoice.status === 'OVERDUE').length}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-sm text-slate-400">Ticket đang mở</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {(customer.supportTickets || []).filter((ticket) =>
                    ['OPEN', 'IN_PROGRESS'].includes(ticket.status),
                  ).length}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === 'systems' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <SectionCard title="Hệ thống đang gắn" eyebrow="Một khách hàng có thể có nhiều site / system" dark>
            <div className="grid gap-3">
              {linkedSystems.length ? (
                linkedSystems.map((system) => (
                  <div key={system.id} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {system.systemCode}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{system.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {systemStatusLabel(system.status)} · {system.stationName || system.location || 'Chưa có địa chỉ'}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Nguồn monitor: {system.monitoringProvider || 'Nội bộ / thủ công'}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={savingSystemId === system.id}
                        onClick={() => void handleUnlinkSystem(system)}
                      >
                        <Link2Off className="h-4 w-4" />
                        Gỡ khỏi khách
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Chưa có system nào được gắn cho khách hàng này.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Gắn thêm system" eyebrow="Chọn system chưa gắn hoặc đang cùng khách này" dark>
            <div className="grid gap-3">
              {availableSystems.map((system) => {
                const isLinked = system.customer?.id === customerId;

                return (
                  <div key={system.id} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {system.systemCode}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{system.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {systemStatusLabel(system.status)} · {system.capacityKwp} kWp
                        </p>
                      </div>

                      {isLinked ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                          Đã gắn
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={savingSystemId === system.id}
                          onClick={() => void handleLinkSystem(system)}
                        >
                          <Link2 className="h-4 w-4" />
                          Gắn vào khách
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === 'contracts' ? (
        <SectionCard title="Danh sách hợp đồng" eyebrow="Theo khách hàng và site đang liên kết" dark>
          <div className="grid gap-3">
            {(customer.contracts || []).length ? (
              customer.contracts!.map((contract) => (
                <div key={contract.id} className="portal-card-soft p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {contract.contractNumber}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-white">
                        {contract.type} · {contract.status}
                      </h3>
                      <p className="mt-2 text-sm text-slate-300">
                        Áp giá {formatCurrency(contract.pricePerKwh || 0)} / kWh · VAT {contract.vatRate || 0}%
                      </p>
                    </div>
                    <div className="text-right text-sm text-slate-400">
                      <p>Bắt đầu: {formatDate(contract.startDate)}</p>
                      <p>Kết thúc: {contract.endDate ? formatDate(contract.endDate) : 'Mở'}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="portal-card-soft p-5 text-sm text-slate-300">
                Chưa có hợp đồng nào gắn với khách hàng này.
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      {tab === 'billing' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard title="Hóa đơn & công nợ" eyebrow="Theo record đã phát hành" dark>
            <div className="grid gap-3">
              {(customer.invoices || []).length ? (
                customer.invoices!.map((invoice) => (
                  <div key={invoice.id} className="portal-card-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {invoice.invoiceNumber}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {formatCurrency(invoice.totalAmount)}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">{invoice.status}</p>
                      </div>
                      <div className="text-right text-sm text-slate-400">
                        <p>Phát hành: {formatDate(invoice.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Chưa phát sinh hóa đơn nào cho khách hàng này.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Ghi chú vận hành" eyebrow="Ticket và trạng thái chăm sóc" dark>
            <div className="grid gap-3">
              {(customer.supportTickets || []).length ? (
                customer.supportTickets!.map((ticket) => (
                  <div key={ticket.id} className="portal-card-soft p-4">
                    <p className="text-sm font-semibold text-white">{ticket.title}</p>
                    <p className="mt-2 text-sm text-slate-300">
                      {ticket.status} · {ticket.priority}
                    </p>
                  </div>
                ))
              ) : (
                <div className="portal-card-soft p-5 text-sm text-slate-300">
                  Chưa có ticket hoặc cảnh báo nào gắn với khách hàng này.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
