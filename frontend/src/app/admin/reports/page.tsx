'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { EnergyChart } from '@/components/energy-chart';
import { RevenueChart } from '@/components/revenue-chart';
import { SectionCard } from '@/components/section-card';
import {
  adminDashboardRequest,
  getCustomerRequest,
  listAdminSystemsRequest,
  listContractsRequest,
  listCustomersRequest,
  listInvoicesRequest,
  listPaymentsRequest,
  listSupportTicketsRequest,
} from '@/lib/api';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import {
  AdminDashboardData,
  AdminSystemRecord,
  ContractRecord,
  CustomerRecord,
  InvoiceRecord,
  PaymentRecord,
  SupportTicketRecord,
} from '@/types';

type PaymentFilter = 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';

function customerName(customer?: CustomerRecord | null) {
  return customer?.companyName || customer?.user.fullName || 'Khách hàng';
}

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
    default:
      return status || 'Chưa rõ';
  }
}

function invoiceBucket(invoice: InvoiceRecord): PaymentFilter {
  if (invoice.status === 'PAID') return 'PAID';
  if (invoice.status === 'OVERDUE') return 'OVERDUE';
  return 'OPEN';
}

function badgeClass(status: string) {
  if (['PAID', 'SUCCESS', 'ACTIVE', 'RESOLVED', 'CLOSED'].includes(status)) {
    return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100';
  }
  if (['OVERDUE', 'FAULT', 'ERROR', 'URGENT'].includes(status)) {
    return 'border-rose-300/20 bg-rose-400/10 text-rose-100';
  }
  if (['WARNING', 'MAINTENANCE', 'IN_PROGRESS'].includes(status)) {
    return 'border-amber-300/20 bg-amber-400/10 text-amber-100';
  }
  return 'border-white/10 bg-white/5 text-slate-200';
}

export default function AdminReportsPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL');
  const [systemStatusFilter, setSystemStatusFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');

  async function loadData() {
    const [a, b, c, d, e, f, g] = await Promise.all([
      adminDashboardRequest(),
      listCustomersRequest(),
      listAdminSystemsRequest(),
      listInvoicesRequest(),
      listContractsRequest(),
      listPaymentsRequest(),
      listSupportTicketsRequest(),
    ]);
    setDashboard(a);
    setCustomers(b);
    setSystems(c);
    setInvoices(d);
    setContracts(e);
    setPayments(f);
    setTickets(g);
  }

  useEffect(() => {
    loadData().catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải báo cáo vận hành.');
    }).finally(() => setLoading(false));
  }, []);

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    customers.forEach((customer) => {
      if (customer.ownerUser?.id) seen.set(customer.ownerUser.id, customer.ownerUser.fullName);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const linkedSystems = systems.filter((system) => system.customer?.id === customer.id);
      const linkedInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
      if (keyword && ![customer.customerCode, customer.companyName, customer.user.fullName, customer.user.email, customer.ownerUser?.fullName].filter(Boolean).join(' ').toLowerCase().includes(keyword)) return false;
      if (ownerFilter !== 'ALL' && customer.ownerUser?.id !== ownerFilter) return false;
      if (systemStatusFilter !== 'ALL' && !linkedSystems.some((system) => system.status === systemStatusFilter)) return false;
      if (paymentFilter !== 'ALL' && !linkedInvoices.some((invoice) => invoiceBucket(invoice) === paymentFilter)) return false;
      return true;
    });
  }, [customers, invoices, ownerFilter, paymentFilter, search, systems, systemStatusFilter]);

  useEffect(() => {
    if (selectedCustomerId && filteredCustomers.some((customer) => customer.id === selectedCustomerId)) return;
    setSelectedCustomerId(filteredCustomers[0]?.id || '');
  }, [filteredCustomers, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    getCustomerRequest(selectedCustomerId).then((detail) => {
      if (active) setSelectedCustomer(detail);
    }).catch(() => {
      if (active) setSelectedCustomer(customers.find((customer) => customer.id === selectedCustomerId) || null);
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => {
      active = false;
    };
  }, [customers, selectedCustomerId]);

  const selectedSystems = useMemo(() => systems.filter((system) => system.customer?.id === selectedCustomerId), [selectedCustomerId, systems]);
  const selectedInvoices = useMemo(() => invoices.filter((invoice) => invoice.customerId === selectedCustomerId), [invoices, selectedCustomerId]);
  const selectedContracts = useMemo(() => contracts.filter((contract) => contract.customer?.id === selectedCustomerId || (contract.solarSystem?.id && systems.some((system) => system.id === contract.solarSystem?.id && system.customer?.id === selectedCustomerId))), [contracts, selectedCustomerId, systems]);
  const selectedPayments = useMemo(() => payments.filter((payment) => payment.customer?.id === selectedCustomerId), [payments, selectedCustomerId]);
  const selectedTickets = useMemo(() => tickets.filter((ticket) => ticket.customer?.id === selectedCustomerId), [selectedCustomerId, tickets]);
  const selectedDebt = useMemo(() => selectedInvoices.reduce((sum, invoice) => sum + (invoice.status === 'PAID' ? 0 : Math.max(invoice.totalAmount - invoice.paidAmount, 0)), 0), [selectedInvoices]);

  if (loading) return <SectionCard title="Báo cáo vận hành" eyebrow="Đang tải dữ liệu" dark><p className="text-sm text-slate-300">Đang tải dashboard và báo cáo khách hàng...</p></SectionCard>;
  if (!dashboard) return <SectionCard title="Báo cáo vận hành" eyebrow="Không thể tải dữ liệu" dark><p className="text-sm text-rose-300">{error || 'Không thể tải báo cáo vận hành.'}</p></SectionCard>;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueChart data={dashboard.revenueTrend} title="Doanh thu và thu tiền" dark />
        <EnergyChart data={dashboard.energyTrend} title="Sản lượng và tải tiêu thụ" dark />
      </div>

      <SectionCard title="Danh sách khách hàng để drill-down" eyebrow="Lọc theo công nợ, hệ thống và nhân sự phụ trách" dark>
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-2 text-sm text-slate-300 xl:col-span-2"><span>Tìm khách hàng</span><input className="portal-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã khách, tên công ty, email..." /></label>
            <label className="grid gap-2 text-sm text-slate-300"><span>Thanh toán</span><select className="portal-field" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}><option value="ALL">Tất cả</option><option value="OPEN">Chờ thanh toán</option><option value="OVERDUE">Quá hạn</option><option value="PAID">Đã thanh toán</option></select></label>
            <label className="grid gap-2 text-sm text-slate-300"><span>Trạng thái hệ thống</span><select className="portal-field" value={systemStatusFilter} onChange={(event) => setSystemStatusFilter(event.target.value)}><option value="ALL">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="MAINTENANCE">Đang bảo trì</option><option value="WARNING">Cảnh báo</option><option value="FAULT">Lỗi</option><option value="OFFLINE">Mất kết nối</option></select></label>
            <label className="grid gap-2 text-sm text-slate-300"><span>Nhân viên phụ trách</span><select className="portal-field" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="ALL">Tất cả</option>{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-ghost" onClick={() => { setLoading(true); setError(''); void loadData().catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Không thể tải lại báo cáo.')).finally(() => setLoading(false)); }}><RefreshCw className="h-4 w-4" />Tải lại báo cáo</button>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">{formatNumber(filteredCustomers.length)} khách phù hợp bộ lọc</div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <SectionCard title="Danh sách khách hàng" eyebrow="Mỗi dòng là một điểm drill-down" dark>
          <div className="grid gap-3">
            {filteredCustomers.length ? filteredCustomers.map((customer) => {
              const linkedSystems = systems.filter((system) => system.customer?.id === customer.id);
              const linkedInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
              const debt = linkedInvoices.reduce((sum, invoice) => sum + (invoice.status === 'PAID' ? 0 : Math.max(invoice.totalAmount - invoice.paidAmount, 0)), 0);
              return (
                <button key={customer.id} type="button" onClick={() => setSelectedCustomerId(customer.id)} className={`portal-card-soft w-full p-4 text-left transition ${customer.id === selectedCustomerId ? 'border border-emerald-300/30 bg-emerald-400/10' : 'hover:bg-white/[0.06]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{customer.customerCode}</p>
                      <p className="mt-2 truncate text-base font-semibold text-white">{customerName(customer)}</p>
                      <p className="mt-1 text-sm text-slate-400">{customer.user.email}</p>
                    </div>
                    <div className="flex items-center gap-3"><span className="text-sm font-semibold text-slate-100">{formatCurrency(debt)}</span><ChevronRight className="h-4 w-4 text-slate-500" /></div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                    <p>Hệ thống: {formatNumber(linkedSystems.length)}</p>
                    <p>Người phụ trách: {customer.ownerUser?.fullName || 'Chưa gán'}</p>
                  </div>
                </button>
              );
            }) : <div className="portal-card-soft p-5 text-sm text-slate-300">Chưa có khách hàng nào phù hợp bộ lọc.</div>}
          </div>
        </SectionCard>

        <SectionCard title="Customer report detail" eyebrow="Khách hàng, hệ thống, hợp đồng, hóa đơn, thanh toán và ticket" dark>
          {selectedCustomer ? (
            <div className="space-y-4">
              <div className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{selectedCustomer.customerCode}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{customerName(selectedCustomer)}</h3>
                    <p className="mt-2 text-sm text-slate-400">{selectedCustomer.user.email}</p>
                    <p className="mt-1 text-sm text-slate-400">Người phụ trách: {selectedCustomer.ownerUser?.fullName || 'Chưa gán'} {detailLoading ? '• đang tải chi tiết...' : ''}</p>
                  </div>
                  <Link href={`/admin/customers/${selectedCustomer.id}`} className="btn-ghost">Mở hồ sơ khách hàng</Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Dư nợ hiện tại</p><p className="mt-2 break-words text-2xl font-semibold text-white">{formatCurrency(selectedDebt)}</p></div>
                <div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Hệ thống</p><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(selectedSystems.length)}</p></div>
                <div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Hợp đồng active</p><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(selectedContracts.filter((contract) => contract.status === 'ACTIVE').length)}</p></div>
                <div className="portal-card-soft p-4"><p className="text-sm text-slate-400">Thanh toán thành công</p><p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(selectedPayments.filter((payment) => payment.status === 'SUCCESS').reduce((sum, payment) => sum + payment.amount, 0))}</p></div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="portal-card-soft p-4"><p className="text-sm font-semibold text-white">Hệ thống & trạng thái</p><div className="mt-4 space-y-3">{selectedSystems.length ? selectedSystems.map((system) => <div key={system.id} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{system.name}</p><p className="mt-1 text-sm text-slate-400">{system.systemCode} • {system.stationName || system.location || 'Chưa có địa điểm'}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(system.status)}`}>{systemStatusLabel(system.status)}</span></div><p className="mt-2 text-sm text-slate-400">Nguồn monitor: {system.monitoringProvider || 'Nội bộ / thủ công'}</p></div>) : <p className="text-sm text-slate-400">Khách này chưa có system nào được gắn.</p>}</div></div>
                <div className="portal-card-soft p-4"><p className="text-sm font-semibold text-white">Hợp đồng đang hiệu lực</p><div className="mt-4 space-y-3">{selectedContracts.length ? selectedContracts.map((contract) => <div key={contract.id} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3"><p className="font-medium text-white">{contract.contractNumber}</p><p className="mt-1 text-sm text-slate-400">{contract.type} • {contract.status}</p><p className="mt-1 text-sm text-slate-400">Đơn giá {formatCurrency(contract.pricePerKwh || 0)} / kWh • VAT {formatNumber(contract.vatRate || 0, '%')}</p></div>) : <p className="text-sm text-slate-400">Chưa có hợp đồng nào được gắn đúng cho khách này.</p>}</div></div>
                <div className="portal-card-soft p-4"><p className="text-sm font-semibold text-white">Hóa đơn & công nợ</p><div className="mt-4 space-y-3">{selectedInvoices.length ? selectedInvoices.slice(0, 6).map((invoice) => <div key={invoice.id} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{invoice.invoiceNumber}</p><p className="mt-1 text-sm text-slate-400">Kỳ {String(invoice.billingMonth).padStart(2, '0')}/{invoice.billingYear}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(invoice.status)}`}>{invoice.status}</span></div><p className="mt-2 text-sm text-slate-400">Còn phải thu {formatCurrency(Math.max(invoice.totalAmount - invoice.paidAmount, 0))}</p></div>) : <p className="text-sm text-slate-400">Chưa có hóa đơn nào.</p>}</div></div>
                <div className="portal-card-soft p-4"><p className="text-sm font-semibold text-white">Thanh toán / ticket / bảo trì</p><div className="mt-4 space-y-3">{selectedPayments.slice(0, 3).map((payment) => <div key={payment.id} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{payment.paymentCode}</p><p className="mt-1 text-sm text-slate-400">{payment.invoice?.invoiceNumber || 'Chưa gắn hóa đơn'}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(payment.status)}`}>{payment.status}</span></div><p className="mt-2 text-sm text-slate-400">{formatCurrency(payment.amount)} • {payment.method}</p></div>)}{selectedTickets.slice(0, 3).map((ticket) => <div key={ticket.id} className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{ticket.title}</p><p className="mt-1 text-sm text-slate-400">Cập nhật {formatDateTime(ticket.updatedAt || ticket.createdAt)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(ticket.status)}`}>{ticket.status}</span></div></div>)}{!selectedPayments.length && !selectedTickets.length ? <p className="text-sm text-slate-400">Chưa có lịch sử thanh toán hay ticket nào để drill-down.</p> : null}</div></div>
              </div>
            </div>
          ) : <div className="portal-card-soft p-5 text-sm text-slate-300">Hãy chọn một khách hàng ở cột bên trái để xem chi tiết hợp đồng, hệ thống, hóa đơn, thanh toán và ticket vận hành.</div>}
        </SectionCard>
      </div>

      {error ? <div className="rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
    </div>
  );
}
