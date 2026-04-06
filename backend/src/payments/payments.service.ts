import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode, slugify } from '../common/helpers/domain.helper';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReviewPaymentDto } from './dto/review-payment.dto';
import { SubmitManualPaymentDto } from './dto/submit-manual-payment.dto';

type UploadProofFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const MAX_PAYMENT_PROOF_FILE_SIZE = 8 * 1024 * 1024;
const PAYMENT_PROOF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditLogsService: AuditLogsService,
  ) {}

  async findAll() {
    const payments = await this.prisma.payment.findMany({
      include: {
        customer: { include: { user: true } },
        invoice: {
          include: {
            contract: {
              include: {
                solarSystem: true,
              },
            },
          },
        },
        reviewedByUser: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => this.serialize(payment));
  }

  async createMockPayment(
    invoiceId: string,
    method = 'MOCK_VNPAY',
    user?: AuthenticatedUser,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        customer: { include: { user: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (user?.role === 'CUSTOMER' && invoice.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    if (user?.role === 'CUSTOMER' && process.env.ENABLE_CUSTOMER_MOCK_PAYMENT !== 'true') {
      throw new ServiceUnavailableException(
        'Online payment gateway is not enabled. Please contact support or pay by manual reconciliation.',
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        paymentCode: generateCode('PAY'),
        gateway: 'MOCK',
        method,
        amount: invoice.totalAmount,
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId:
          user?.role && ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(user.role)
            ? user.sub
            : null,
        metadata: { providerResponse: 'mock_success' },
      },
      include: {
        invoice: true,
        reviewedByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: invoice.totalAmount,
        status: InvoiceStatus.PAID,
      },
    });

    await this.notificationsService.create({
      userId: invoice.customer.userId,
      title: 'Thanh toan thanh cong',
      body: `Hoa don ${invoice.invoiceNumber} da duoc ghi nhan thanh toan qua ${method}.`,
    });

    await this.auditLogsService.log({
      userId: user?.sub,
      action: 'PAYMENT_RECORDED',
      moduleKey: 'billing',
      entityType: 'Payment',
      entityId: payment.id,
      payload: {
        invoiceId,
        method,
      },
    });

    await this.auditLogsService.log({
      userId: user?.sub,
      action: 'INVOICE_PAYMENT_RECORDED',
      moduleKey: 'billing',
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: {
        paymentId: payment.id,
        method,
        amount: Number(payment.amount || 0),
      },
    });

    if (user?.sub) {
      await this.auditLogsService.touchEntity({
        entityType: 'Invoice',
        entityId: invoice.id,
        actorId: user.sub,
        moduleKey: 'billing',
      });
    }

    return this.serialize(payment);
  }

  async submitManualPayment(
    invoiceId: string,
    dto: SubmitManualPaymentDto,
    proofFile: UploadProofFile | undefined,
    user: AuthenticatedUser,
  ) {
    if (user.role !== 'CUSTOMER' || !user.customerId) {
      throw new ForbiddenException('Only customer accounts can submit manual payments');
    }

    if (!proofFile) {
      throw new BadRequestException('Vui long tai len bien lai hoac minh chung thanh toan.');
    }

    this.assertProofFile(proofFile);

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        customer: { include: { user: true } },
        contract: {
          include: {
            solarSystem: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Hoa don nay da duoc thanh toan xong.');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Khong the nop bien lai cho hoa don da huy.');
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: {
        invoiceId,
        customerId: user.customerId,
        status: PaymentStatus.PENDING,
      },
      select: { id: true },
    });

    if (existingPending) {
      throw new BadRequestException(
        'Hoa don nay da co bien lai dang cho xac nhan. Vui long doi ket qua doi soat.',
      );
    }

    const outstandingAmount = Math.max(
      Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0),
      0,
    );

    if (outstandingAmount <= 0) {
      throw new BadRequestException('Hoa don nay hien khong con so du can thanh toan.');
    }

    const amount = dto.amount ?? outstandingAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('So tien thanh toan khong hop le.');
    }

    if (amount > outstandingAmount) {
      throw new BadRequestException(
        'So tien nop bien lai vuot qua so du can thanh toan cua hoa don.',
      );
    }

    const storedProof = await this.storeProofFile(proofFile);

    const payment = await this.prisma.payment.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        paymentCode: generateCode('PAY'),
        gateway: 'MANUAL',
        method: dto.method?.trim() || 'BANK_TRANSFER',
        amount,
        status: PaymentStatus.PENDING,
        proofStoragePath: storedProof.storagePath,
        proofOriginalName: proofFile.originalname,
        proofMimeType: proofFile.mimetype,
        referenceNote: dto.referenceNote?.trim() || null,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          submittedFrom: 'customer_portal',
        },
      },
      include: {
        invoice: true,
        reviewedByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.notificationsService.create({
      userId: invoice.customer.userId,
      title: 'Bien lai dang cho xac nhan',
      body: `Bien lai thanh toan cho hoa don ${invoice.invoiceNumber} da duoc ghi nhan va dang cho doi soat.`,
    });

    await this.auditLogsService.log({
      userId: user.sub,
      action: 'PAYMENT_PROOF_SUBMITTED',
      moduleKey: 'billing',
      entityType: 'Payment',
      entityId: payment.id,
      payload: {
        invoiceId,
        method: dto.method?.trim() || 'BANK_TRANSFER',
        amount,
      },
    });

    await this.auditLogsService.log({
      userId: user.sub,
      action: 'INVOICE_PAYMENT_PROOF_SUBMITTED',
      moduleKey: 'billing',
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: {
        paymentId: payment.id,
        amount,
      },
    });

    await this.auditLogsService.touchEntity({
      entityType: 'Invoice',
      entityId: invoice.id,
      actorId: user.sub,
      moduleKey: 'billing',
    });

    return this.serialize(payment);
  }

  async reviewManualPayment(
    paymentId: string,
    dto: ReviewPaymentDto,
    user: AuthenticatedUser,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            customer: { include: { user: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Giao dich nay da duoc xu ly truoc do.');
    }

    const reviewStatus = dto.status;

    await this.prisma.$transaction(async (tx) => {
      const nextPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: reviewStatus,
          paidAt: reviewStatus === PaymentStatus.SUCCESS ? new Date() : null,
          reviewedAt: new Date(),
          reviewedByUserId: user.sub,
          reviewNote: dto.reviewNote?.trim() || null,
        },
        include: {
          invoice: true,
          reviewedByUser: {
            include: {
              role: true,
            },
          },
        },
      });

      if (reviewStatus === PaymentStatus.SUCCESS) {
        const nextPaidAmount = Math.min(
          Number(payment.invoice.paidAmount || 0) + Number(payment.amount || 0),
          Number(payment.invoice.totalAmount || 0),
        );

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: nextPaidAmount,
            status:
              nextPaidAmount >= Number(payment.invoice.totalAmount || 0)
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIAL,
          },
        });
      }
    });

    const updated = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        customer: { include: { user: true } },
        invoice: {
          include: {
            contract: {
              include: {
                solarSystem: true,
              },
            },
          },
        },
        reviewedByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('Payment record not found after review');
    }

    await this.notificationsService.create({
      userId: payment.invoice.customer.userId,
      title:
        reviewStatus === PaymentStatus.SUCCESS
          ? 'Thanh toan da duoc xac nhan'
          : 'Bien lai can bo sung',
      body:
        reviewStatus === PaymentStatus.SUCCESS
          ? `Hoa don ${payment.invoice.invoiceNumber} da duoc doi soat thanh cong.`
          : `Bien lai thanh toan cho hoa don ${payment.invoice.invoiceNumber} da bi tu choi. Vui long kiem tra lai thong tin va nop lai.`,
    });

    await this.auditLogsService.log({
      userId: user.sub,
      action:
        reviewStatus === PaymentStatus.SUCCESS
          ? 'PAYMENT_CONFIRMED'
          : 'PAYMENT_REJECTED',
      moduleKey: 'billing',
      entityType: 'Payment',
      entityId: paymentId,
      payload: {
        invoiceId: payment.invoiceId,
        reviewNote: dto.reviewNote?.trim() || null,
      },
    });

    await this.auditLogsService.log({
      userId: user.sub,
      action:
        reviewStatus === PaymentStatus.SUCCESS
          ? 'INVOICE_PAYMENT_CONFIRMED'
          : 'INVOICE_PAYMENT_REJECTED',
      moduleKey: 'billing',
      entityType: 'Invoice',
      entityId: payment.invoiceId,
      payload: {
        paymentId,
        reviewNote: dto.reviewNote?.trim() || null,
      },
    });

    await this.auditLogsService.touchEntity({
      entityType: 'Invoice',
      entityId: payment.invoiceId,
      actorId: user.sub,
      moduleKey: 'billing',
    });

    return this.serialize(updated);
  }

  async resolveProofFile(paymentId: string, user: AuthenticatedUser) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (
      user.role === 'CUSTOMER' &&
      payment.invoice.customerId !== user.customerId
    ) {
      throw new ForbiddenException('You do not have access to this proof file');
    }

    if (!payment.proofStoragePath) {
      throw new NotFoundException('Payment proof file not found');
    }

    const filePath = path.resolve(process.cwd(), payment.proofStoragePath);
    await fs.access(filePath).catch(() => {
      throw new NotFoundException('Stored payment proof file not found');
    });

    return {
      filePath,
      mimeType: payment.proofMimeType || 'application/octet-stream',
      originalName: payment.proofOriginalName || `${payment.paymentCode}.bin`,
    };
  }

  async findMine(customerId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        OR: [
          { customerId },
          {
            invoice: {
              customerId,
            },
          },
          {
            invoice: {
              contract: {
                customerId,
              },
            },
          },
          {
            invoice: {
              contract: {
                solarSystem: {
                  customerId,
                },
              },
            },
          },
        ],
      },
      include: {
        invoice: {
          include: {
            contract: {
              include: {
                solarSystem: true,
              },
            },
          },
        },
        reviewedByUser: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => this.serialize(payment));
  }

  private serialize(payment: any) {
    return {
      ...payment,
      amount: Number(payment.amount || 0),
      proofFileUrl: payment.proofStoragePath ? `/api/payments/${payment.id}/proof` : null,
      invoice: payment.invoice
        ? {
            ...payment.invoice,
            totalAmount: Number(payment.invoice.totalAmount || 0),
            paidAmount: Number(payment.invoice.paidAmount || 0),
          }
        : null,
      reviewedByUser: payment.reviewedByUser
        ? {
            id: payment.reviewedByUser.id,
            fullName: payment.reviewedByUser.fullName,
            email: payment.reviewedByUser.email,
            role: payment.reviewedByUser.role,
          }
        : null,
    };
  }

  private assertProofFile(file: UploadProofFile) {
    if (!PAYMENT_PROOF_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Chi ho tro anh JPG, PNG, WEBP hoac file PDF cho bien lai thanh toan.',
      );
    }

    if (file.size > MAX_PAYMENT_PROOF_FILE_SIZE) {
      throw new BadRequestException('Bien lai thanh toan vuot gioi han 8 MB.');
    }
  }

  private async storeProofFile(file: UploadProofFile) {
    const storageRoot = path.resolve(
      process.cwd(),
      process.env.PAYMENT_PROOF_STORAGE_DIR || path.join('storage', 'payment-proofs'),
    );
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const relativeDir = path.join('storage', 'payment-proofs', year, month);
    const absoluteDir = path.join(storageRoot, year, month);

    await fs.mkdir(absoluteDir, { recursive: true });

    const extension = path.extname(file.originalname).toLowerCase() || this.resolveFileExtension(file.mimetype);
    const baseName = slugify(path.parse(file.originalname).name) || 'payment-proof';
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${extension}`;
    const absolutePath = path.join(absoluteDir, storedName);
    const storagePath = path.join(relativeDir, storedName).replace(/\\/g, '/');

    await fs.writeFile(absolutePath, file.buffer);

    return {
      storagePath,
    };
  }

  private resolveFileExtension(mimeType: string) {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'application/pdf':
        return '.pdf';
      default:
        return '';
    }
  }
}
