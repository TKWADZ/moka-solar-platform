import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceCalculatorService } from './invoice-calculator.service';
import { getMonthDateRange, generateCode } from '../common/helpers/domain.helper';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { buildInvoicePdf } from './invoice-pdf.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  aggregateOperationalPeriodMetrics,
  buildOperationalPeriodKey,
  extractOperationalPeriodMetrics,
} from '../common/helpers/operational-period.helper';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private calculator: InvoiceCalculatorService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
    private monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  async findAll() {
    await this.refreshOverdueStatuses();

    const invoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        customer: { include: { user: true } },
        contract: { include: { servicePackage: true, solarSystem: true } },
        items: true,
        payments: true,
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
    });

    return this.attachPeriodMetrics(invoices);
  }

  async findMine(customerId: string) {
    await this.refreshOverdueStatuses();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        OR: [
          { customerId },
          {
            contract: {
              customerId,
              deletedAt: null,
            },
          },
          {
            contract: {
              solarSystem: {
                customerId,
                deletedAt: null,
              },
            },
          },
        ],
      },
      include: {
        items: true,
        payments: true,
        customer: { include: { user: true } },
        contract: { include: { servicePackage: true, solarSystem: true } },
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
    });

    return this.attachPeriodMetrics(invoices);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { include: { user: true } },
        contract: { include: { servicePackage: true, solarSystem: true } },
        items: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (
      user.role === 'CUSTOMER' &&
      invoice.customerId !== user.customerId &&
      invoice.contract?.customerId !== user.customerId &&
      invoice.contract?.solarSystem?.customerId !== user.customerId
    ) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    const [serialized] = await this.attachPeriodMetrics([invoice]);
    return serialized;
  }

  async buildPdf(id: string, user: AuthenticatedUser) {
    const invoice = await this.findOne(id, user);
    const buffer = await buildInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer.companyName || invoice.customer.user.fullName,
      contractNumber: invoice.contract.contractNumber,
      issuedAt: invoice.issuedAt.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      totalAmount: `${Number(invoice.totalAmount).toLocaleString('vi-VN')} \u0111`,
      lines: invoice.items.map(
        (item) =>
          `${item.description} - SL ${Number(item.quantity)} x ${Number(item.unitPrice).toLocaleString('vi-VN')} \u0111 = ${Number(item.amount).toLocaleString('vi-VN')} \u0111`,
      ),
    });

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      buffer,
    };
  }

  async generateMonthlyInvoice(
    contractId: string,
    month: number,
    year: number,
    actorId?: string,
  ) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: {
        id: true,
        solarSystemId: true,
      },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    const monthlyPvBilling = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        contractId,
        solarSystemId: contract.solarSystemId,
        month,
        year,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (monthlyPvBilling?.id) {
      const result = await this.monthlyPvBillingsService.generateInvoice(
        monthlyPvBilling.id,
        actorId,
      );
      return result.invoice;
    }

    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        contractId,
        billingMonth: month,
        billingYear: year,
        deletedAt: null,
      },
      include: {
        items: true,
      },
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    throw new NotFoundException(
      'Chua co du lieu billing thang da duoc doi soat. Vui long tao Monthly PV billing truoc khi phat hanh hoa don.',
    );
  }

  private async attachPeriodMetrics(invoices: any[]) {
    if (!invoices.length) {
      return [];
    }

    const systemLookups = invoices
      .map((invoice) => ({
        key: buildOperationalPeriodKey(
          invoice.contract?.solarSystemId || invoice.contract?.solarSystem?.id,
          invoice.billingYear,
          invoice.billingMonth,
        ),
        solarSystemId: invoice.contract?.solarSystemId || invoice.contract?.solarSystem?.id,
        year: invoice.billingYear,
        month: invoice.billingMonth,
      }))
      .filter(
        (
          item,
        ): item is {
          key: string;
          solarSystemId: string;
          year: number;
          month: number;
        } => Boolean(item.key && item.solarSystemId && item.year && item.month),
      );
    const customerLookups = invoices
      .map((invoice) => ({
        key:
          invoice.customerId && invoice.billingYear && invoice.billingMonth
            ? `${invoice.customerId}:${invoice.billingYear}:${invoice.billingMonth}`
            : null,
        customerId: invoice.customerId || null,
        year: invoice.billingYear,
        month: invoice.billingMonth,
      }))
      .filter(
        (
          item,
        ): item is {
          key: string;
          customerId: string;
          year: number;
          month: number;
        } => Boolean(item.key && item.customerId && item.year && item.month),
      );

    const periodRecords = systemLookups.length || customerLookups.length
      ? await this.prisma.monthlyEnergyRecord.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...systemLookups.map((item) => ({
                solarSystemId: item.solarSystemId,
                year: item.year,
                month: item.month,
              })),
              ...customerLookups.map((item) => ({
                customerId: item.customerId,
                year: item.year,
                month: item.month,
              })),
            ],
          },
        })
      : [];

    const periodRecordMap = new Map<string, any[]>();
    const customerPeriodRecordMap = new Map<string, any[]>();

    for (const record of periodRecords) {
      const systemKey = buildOperationalPeriodKey(
        record.solarSystemId,
        record.year,
        record.month,
      );
      if (systemKey) {
        const existing = periodRecordMap.get(systemKey) || [];
        existing.push(record);
        periodRecordMap.set(systemKey, existing);
      }

      if (record.customerId) {
        const customerKey = `${record.customerId}:${record.year}:${record.month}`;
        const existing = customerPeriodRecordMap.get(customerKey) || [];
        existing.push(record);
        customerPeriodRecordMap.set(customerKey, existing);
      }
    }

    return invoices.map((invoice) => {
      const systemKey =
        buildOperationalPeriodKey(
          invoice.contract?.solarSystemId || invoice.contract?.solarSystem?.id,
          invoice.billingYear,
          invoice.billingMonth,
        ) || '';
      const customerKey =
        invoice.customerId && invoice.billingYear && invoice.billingMonth
          ? `${invoice.customerId}:${invoice.billingYear}:${invoice.billingMonth}`
          : '';
      const systemPeriodRecords = periodRecordMap.get(systemKey) || [];
      const customerPeriodRecords = customerPeriodRecordMap.get(customerKey) || [];
      const periodMetrics = aggregateOperationalPeriodMetrics(
        systemPeriodRecords.length ? systemPeriodRecords : customerPeriodRecords,
        {
          year: invoice.billingYear,
          month: invoice.billingMonth,
        },
      );

      return {
        ...invoice,
        subtotal: Number(invoice.subtotal || 0),
        vatRate: Number(invoice.vatRate || 0),
        vatAmount: Number(invoice.vatAmount || 0),
        penaltyAmount: Number(invoice.penaltyAmount || 0),
        discountAmount: Number(invoice.discountAmount || 0),
        totalAmount: Number(invoice.totalAmount || 0),
        paidAmount: Number(invoice.paidAmount || 0),
        items: invoice.items?.map((item: any) => ({
          ...item,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          amount: Number(item.amount || 0),
        })) || [],
        payments: invoice.payments?.map((payment: any) => ({
          ...payment,
          amount: Number(payment.amount || 0),
        })) || [],
        periodMetrics,
      };
    });
  }

  private async refreshOverdueStatuses() {
    await this.prisma.invoice.updateMany({
      where: {
        deletedAt: null,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        dueDate: { lt: new Date() },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
  }

  private serializeInvoiceAuditState(invoice: any) {
    return {
      customerId: invoice.customerId || null,
      contractId: invoice.contractId || null,
      invoiceNumber: invoice.invoiceNumber || null,
      billingMonth: invoice.billingMonth ?? null,
      billingYear: invoice.billingYear ?? null,
      status: invoice.status || null,
      totalAmount: invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
      paidAmount: invoice.paidAmount != null ? Number(invoice.paidAmount) : null,
      dueDate: invoice.dueDate?.toISOString?.() || null,
      issuedAt: invoice.issuedAt?.toISOString?.() || null,
    };
  }
}
