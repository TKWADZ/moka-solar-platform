import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteSettingsService } from '../website-settings/website-settings.service';

type ZaloTemplateType = 'INVOICE' | 'REMINDER' | 'PAID';

type ResolvedZaloConfig = {
  appId: string | null;
  appSecret: string | null;
  oaId: string | null;
  accessToken: string | null;
  apiBaseUrl: string;
  dryRun: boolean;
  templateIds: Record<ZaloTemplateType, string | null>;
  missingRequired: string[];
  missingRecommended: string[];
};

@Injectable()
export class ZaloNotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly websiteSettingsService: WebsiteSettingsService,
  ) {}

  async getStatus() {
    const config = this.resolveConfig();

    return {
      configuredForSend: config.missingRequired.length === 0,
      dryRun: config.dryRun,
      apiBaseUrl: config.apiBaseUrl,
      hasAppId: Boolean(config.appId),
      hasAppSecret: Boolean(config.appSecret),
      hasAccessToken: Boolean(config.accessToken),
      oaIdPreview: this.maskValue(config.oaId),
      templateIds: {
        INVOICE: this.serializeTemplateStatus(config.templateIds.INVOICE),
        REMINDER: this.serializeTemplateStatus(config.templateIds.REMINDER),
        PAID: this.serializeTemplateStatus(config.templateIds.PAID),
      },
      missingRequired: config.missingRequired,
      missingRecommended: config.missingRecommended,
    };
  }

  async listLogs(filters?: { invoiceId?: string; limit?: number }) {
    const logs = await this.prisma.zaloMessageLog.findMany({
      where: {
        deletedAt: null,
        ...(filters?.invoiceId ? { invoiceId: filters.invoiceId } : {}),
      },
      include: {
        invoice: {
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filters?.limit || 20, 100),
    });

    return logs.map((log) => ({
      id: log.id,
      invoiceId: log.invoiceId,
      invoiceNumber: log.invoice?.invoiceNumber || null,
      customerName: log.customerName,
      recipientPhone: log.recipientPhone,
      templateType: log.templateType,
      templateId: log.templateId,
      sendStatus: log.sendStatus,
      providerCode: log.providerCode,
      providerMessage: log.providerMessage,
      dryRun: log.dryRun,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async sendInvoiceNotification(options: {
    invoiceId: string;
    actorId?: string;
    templateType?: ZaloTemplateType;
    recipientPhone?: string;
    dryRun?: boolean;
  }) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: options.invoiceId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        contract: {
          include: {
            solarSystem: true,
          },
        },
        monthlyPvBilling: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const templateType: ZaloTemplateType = options.templateType || 'INVOICE';
    const config = this.resolveConfig();
    const recipientPhone = this.normalizePhoneNumber(
      options.recipientPhone || invoice.customer?.user?.phone || '',
    );
    const hotline = await this.resolveHotline();
    const paymentLink = this.buildPaymentLink(invoice.id);
    const templateId = config.templateIds[templateType];
    const payloadVariables = {
      customer_name:
        invoice.customer?.companyName?.trim() ||
        invoice.customer?.user?.fullName?.trim() ||
        'Quy khach',
      billing_month: `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`,
      consumption_kwh: this.formatDecimalForPayload(
        invoice.monthlyPvBilling?.billableKwh || invoice.monthlyPvBilling?.pvGenerationKwh || 0,
      ),
      amount_due: this.formatCurrencyForPayload(
        Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0),
      ),
      due_date: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '',
      payment_link: paymentLink,
      hotline,
    };

    const requestPayload = {
      oa_id: config.oaId,
      phone: recipientPhone,
      template_id: templateId,
      template_data: payloadVariables,
      tracking_id: invoice.invoiceNumber,
      invoice_id: invoice.id,
    };

    if (!recipientPhone) {
      return this.logAndReturnResult({
        invoice,
        actorId: options.actorId,
        templateType,
        templateId,
        recipientPhone: '',
        dryRun: true,
        requestPayload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_PHONE',
        providerMessage: 'Khach hang chua co so dien thoai de gui thong bao Zalo.',
      });
    }

    const effectiveDryRun =
      options.dryRun === true || config.dryRun || config.missingRequired.length > 0;

    if (effectiveDryRun) {
      const providerMessage =
        config.missingRequired.length > 0
          ? `Dry-run: thieu cau hinh Zalo (${config.missingRequired.join(', ')}).`
          : 'Dry-run: gui that dang bi tat trong moi truong hien tai.';

      return this.logAndReturnResult({
        invoice,
        actorId: options.actorId,
        templateType,
        templateId,
        recipientPhone,
        dryRun: true,
        requestPayload,
        sendStatus: 'DRY_RUN',
        providerCode: 'DRY_RUN',
        providerMessage,
        responsePayload: {
          simulated: true,
          missingRequired: config.missingRequired,
        },
      });
    }

    const sendUrl = this.buildSendUrl(config.apiBaseUrl);
    let response: Response;
    let responseBody: unknown = null;

    try {
      response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
          'X-Zalo-OA-ID': config.oaId || '',
        },
        body: JSON.stringify(requestPayload),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Khong the ket noi Zalo API: ${error.message}`
          : 'Khong the ket noi Zalo API.',
      );
    }

    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    const normalizedProviderCode = this.extractProviderCode(responseBody);
    const normalizedProviderMessage =
      this.extractProviderMessage(responseBody) ||
      (response.ok ? 'Zalo API accepted the request.' : `HTTP ${response.status}`);
    const sendStatus = response.ok && this.isProviderSuccess(responseBody) ? 'SENT' : 'FAILED';

    return this.logAndReturnResult({
      invoice,
      actorId: options.actorId,
      templateType,
      templateId,
      recipientPhone,
      dryRun: false,
      requestPayload,
      responsePayload: responseBody,
      sendStatus,
      providerCode: normalizedProviderCode,
      providerMessage: normalizedProviderMessage,
    });
  }

  private async logAndReturnResult(params: {
    invoice: any;
    actorId?: string;
    templateType: ZaloTemplateType;
    templateId: string | null;
    recipientPhone: string;
    dryRun: boolean;
    requestPayload: Record<string, unknown>;
    responsePayload?: unknown;
    sendStatus: string;
    providerCode?: string | null;
    providerMessage: string;
  }) {
    const log = await this.prisma.zaloMessageLog.create({
      data: {
        invoiceId: params.invoice.id,
        customerId: params.invoice.customerId,
        customerName:
          params.invoice.customer?.companyName || params.invoice.customer?.user?.fullName || 'Quy khach',
        recipientPhone: params.recipientPhone || '',
        templateType: params.templateType,
        templateId: params.templateId,
        sendStatus: params.sendStatus,
        providerCode: params.providerCode || null,
        providerMessage: params.providerMessage,
        dryRun: params.dryRun,
        requestPayload:
          (params.requestPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        responsePayload:
          params.responsePayload !== undefined
            ? ((params.responsePayload as Prisma.InputJsonValue) ?? Prisma.JsonNull)
            : Prisma.JsonNull,
      },
    });

    await this.auditLogsService.log({
      userId: params.actorId,
      action: 'ZALO_INVOICE_NOTIFICATION_SENT',
      entityType: 'ZaloMessageLog',
      entityId: log.id,
      payload: {
        invoiceId: params.invoice.id,
        invoiceNumber: params.invoice.invoiceNumber,
        templateType: params.templateType,
        sendStatus: params.sendStatus,
        dryRun: params.dryRun,
        providerCode: params.providerCode || null,
      },
    });

    return {
      success: params.sendStatus === 'SENT' || params.sendStatus === 'DRY_RUN',
      dryRun: params.dryRun,
      status: params.sendStatus,
      invoiceId: params.invoice.id,
      invoiceNumber: params.invoice.invoiceNumber,
      customerName:
        params.invoice.customer?.companyName || params.invoice.customer?.user?.fullName || 'Quy khach',
      recipientPhone: params.recipientPhone || null,
      templateType: params.templateType,
      templateId: params.templateId,
      providerCode: params.providerCode || null,
      providerMessage: params.providerMessage,
      logId: log.id,
      sentAt: log.createdAt.toISOString(),
    };
  }

  private resolveConfig(): ResolvedZaloConfig {
    const appId = this.readEnv('ZALO_APP_ID');
    const appSecret = this.readEnv('ZALO_APP_SECRET');
    const oaId = this.readEnv('ZALO_OA_ID');
    const accessToken = this.readEnv('ZALO_ACCESS_TOKEN');
    const apiBaseUrl =
      this.readEnv('ZALO_API_BASE_URL') || 'https://openapi.zalo.me/v3.0/oa';
    const templateIds = {
      INVOICE: this.readEnv('ZALO_TEMPLATE_INVOICE_ID'),
      REMINDER: this.readEnv('ZALO_TEMPLATE_REMINDER_ID'),
      PAID: this.readEnv('ZALO_TEMPLATE_PAID_ID'),
    } satisfies Record<ZaloTemplateType, string | null>;
    const dryRun = this.configService.get<string>('ZALO_DRY_RUN') !== 'false';

    const missingRequired = [
      !oaId ? 'ZALO_OA_ID' : null,
      !accessToken ? 'ZALO_ACCESS_TOKEN' : null,
      !templateIds.INVOICE ? 'ZALO_TEMPLATE_INVOICE_ID' : null,
      !apiBaseUrl ? 'ZALO_API_BASE_URL' : null,
    ].filter((value): value is string => Boolean(value));

    const missingRecommended = [
      !appId ? 'ZALO_APP_ID' : null,
      !appSecret ? 'ZALO_APP_SECRET' : null,
      !templateIds.REMINDER ? 'ZALO_TEMPLATE_REMINDER_ID' : null,
      !templateIds.PAID ? 'ZALO_TEMPLATE_PAID_ID' : null,
    ].filter((value): value is string => Boolean(value));

    return {
      appId,
      appSecret,
      oaId,
      accessToken,
      apiBaseUrl,
      dryRun,
      templateIds,
      missingRequired,
      missingRecommended,
    };
  }

  private readEnv(name: string) {
    const value = this.configService.get<string>(name)?.trim();
    return value || null;
  }

  private buildSendUrl(apiBaseUrl: string) {
    const trimmed = apiBaseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/message/template')
      ? trimmed
      : `${trimmed}/message/template`;
  }

  private async resolveHotline() {
    const envHotline = this.configService.get<string>('MOKA_HOTLINE')?.trim();
    if (envHotline) {
      return envHotline;
    }

    try {
      const setting = await this.websiteSettingsService.findPublicSite();
      const content = (setting.content || {}) as Record<string, any>;
      const candidates = [
        content?.contact?.hotline,
        content?.contactCard?.hotline,
        content?.company?.hotline,
        content?.hotline,
      ];
      const match = candidates.find(
        (value) => typeof value === 'string' && value.trim().length > 0,
      );

      if (match) {
        return match.trim();
      }
    } catch {
      // Ignore website settings lookup errors and fallback below.
    }

    return 'Moka Solar';
  }

  private buildPaymentLink(invoiceId: string) {
    const base =
      this.configService.get<string>('NEXT_PUBLIC_SITE_URL')?.trim() ||
      'https://mokasolar.com';

    return `${base.replace(/\/$/, '')}/customer/payments?invoice=${encodeURIComponent(invoiceId)}`;
  }

  private normalizePhoneNumber(value: string) {
    const raw = value.trim();
    if (!raw) {
      return '';
    }

    const normalized = raw.replace(/[^\d+]/g, '');

    if (normalized.startsWith('+84')) {
      return normalized;
    }

    if (normalized.startsWith('84')) {
      return `+${normalized}`;
    }

    if (normalized.startsWith('0')) {
      return `+84${normalized.slice(1)}`;
    }

    return normalized;
  }

  private formatDecimalForPayload(value: unknown) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2).replace(/\.00$/, '') : '0';
  }

  private formatCurrencyForPayload(value: number) {
    return Math.round(Number(value || 0)).toString();
  }

  private serializeTemplateStatus(value: string | null) {
    return {
      configured: Boolean(value),
      idPreview: this.maskValue(value),
    };
  }

  private maskValue(value: string | null) {
    if (!value) {
      return null;
    }

    if (value.length <= 6) {
      return `${value.slice(0, 2)}***`;
    }

    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }

  private extractProviderCode(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const candidate = source.error || source.code || source.error_code || source.status;
    return candidate !== undefined && candidate !== null ? String(candidate) : null;
  }

  private extractProviderMessage(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const candidate = source.message || source.msg || source.error_message || source.description;
    return candidate !== undefined && candidate !== null ? String(candidate) : null;
  }

  private isProviderSuccess(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return true;
    }

    const source = payload as Record<string, unknown>;
    if (source.success === true) {
      return true;
    }

    if (source.error === 0 || source.code === 0 || source.code === '0') {
      return true;
    }

    if (source.error === undefined && source.code === undefined && source.success === undefined) {
      return true;
    }

    return false;
  }
}
