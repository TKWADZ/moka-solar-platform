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

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private calculator: InvoiceCalculatorService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
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
    const buffer = buildInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer.companyName || invoice.customer.user.fullName,
      contractNumber: invoice.contract.contractNumber,
      issuedAt: invoice.issuedAt.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      totalAmount: `${Number(invoice.totalAmount).toLocaleString('vi-VN')} VND`,
      lines: invoice.items.map(
        (item) =>
          `${item.description} - qty ${Number(item.quantity)} x ${Number(item.unitPrice).toLocaleString('vi-VN')} = ${Number(item.amount).toLocaleString('vi-VN')} VND`,
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

    const { from, to } = getMonthDateRange(year, month);
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      include: {
        customer: { include: { user: true } },
        solarSystem: {
          include: {
            energyRecords: {
              where: {
                recordDate: {
                  gte: from,
                  lte: to,
                },
              },
            },
          },
        },
        servicePackage: true,
      },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    const monthlyPvBilling = await this.prisma.monthlyPvBilling.findFirst({
      where: {
        contractId: contract.id,
        solarSystemId: contract.solarSystemId,
        month,
        year,
        deletedAt: null,
      },
      include: {
        solarSystem: true,
      },
    });

    const totalImportedKwh = contract.solarSystem.energyRecords.reduce(
      (sum, record) => sum + Number(record.gridImportedKwh),
      0,
    );

    const yearsFromStart = Math.max(0, year - contract.startDate.getUTCFullYear());

    const result = monthlyPvBilling
      ? {
          subtotal: Number(monthlyPvBilling.subtotalAmount),
          discountAmount: Number(monthlyPvBilling.discountAmount),
          vatAmount: Number(monthlyPvBilling.taxAmount),
          vatRate: Number(monthlyPvBilling.vatRate || 0),
          penaltyAmount: 0,
          totalAmount: Number(monthlyPvBilling.totalAmount),
          items: [
            {
              description: `San luong PV thang ${String(month).padStart(2, '0')}/${year} - ${monthlyPvBilling.solarSystem.name}`,
              quantity: Number(monthlyPvBilling.billableKwh),
              unitPrice: Number(monthlyPvBilling.unitPrice),
              amount: Number(monthlyPvBilling.subtotalAmount),
            },
          ],
        }
      : this.calculator.calculate({
          contractType: contract.type,
          fixedMonthlyFee: Number(contract.fixedMonthlyFee || 0),
          pricePerKwh: Number(contract.pricePerKwh || contract.servicePackage.pricePerKwh || 0),
          vatRate: Number(contract.vatRate || contract.servicePackage.vatRate || 0),
          lateFeeRate: Number(contract.servicePackage.lateFeeRate || 0),
          earlyDiscountRate: Number(contract.servicePackage.earlyDiscountRate || 0),
          interestRate: Number(contract.interestRate || 0),
          termMonths: contract.termMonths || 12,
          gridImportedKwh: totalImportedKwh,
          serviceFee: Number(contract.servicePackage.maintenanceFee || 0),
          principalAmount: Number(contract.fixedMonthlyFee || 120000000),
          annualEscalationRate: Number(contract.servicePackage.annualEscalationRate || 0),
          yearsFromStart,
          applyLateFee: false,
        });

    const invoice = await this.prisma.invoice.create({
      data: {
        customerId: contract.customerId,
        contractId: contract.id,
        invoiceNumber: generateCode(`INV-${year}${String(month).padStart(2, '0')}`),
        billingMonth: month,
        billingYear: year,
        issuedAt: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subtotal: result.subtotal,
        vatRate: Number((result as any).vatRate || contract.vatRate || contract.servicePackage.vatRate || 0),
        vatAmount: result.vatAmount,
        penaltyAmount: result.penaltyAmount,
        discountAmount: result.discountAmount,
        totalAmount: result.totalAmount,
        status: InvoiceStatus.ISSUED,
        items: { create: result.items },
      },
      include: {
        items: true,
        customer: { include: { user: true } },
      },
    });

    if (monthlyPvBilling && !monthlyPvBilling.invoiceId) {
      await this.prisma.monthlyPvBilling.update({
        where: { id: monthlyPvBilling.id },
        data: {
          contractId: contract.id,
          invoiceId: invoice.id,
        },
      });
    }

    await this.notificationsService.create({
      userId: contract.customer.userId,
      title: 'Hoa don moi da san sang',
      body: `Hoa don ${invoice.invoiceNumber} cho ky ${String(month).padStart(2, '0')}/${year} da duoc phat hanh.`,
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'INVOICE_GENERATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: {
        contractId,
        month,
        year,
      },
    });

    const [serialized] = await this.attachPeriodMetrics([invoice]);
    return serialized;
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
}
