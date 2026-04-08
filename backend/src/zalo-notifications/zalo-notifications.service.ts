import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { maskSecret } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermission } from '../common/auth/permissions';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { WebsiteSettingsService } from '../website-settings/website-settings.service';
import { TestZaloConnectionDto } from './dto/test-zalo-connection.dto';
import { UpdateZaloSettingsDto } from './dto/update-zalo-settings.dto';
import {
  ResolvedZaloConfig,
  ZaloSettingsService,
  ZaloTemplateType,
} from './zalo-settings.service';

type SendExecutionParams = {
  actorId?: string;
  invoice?: any | null;
  customerId?: string | null;
  customerName: string;
  templateType: ZaloTemplateType | 'TEST';
  templateId: string | null;
  recipientPhone: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
  dryRun: boolean;
  sendStatus: string;
  providerCode?: string | null;
  providerMessage: string;
  missingRequired?: string[];
  missingRecommended?: string[];
  missingTemplateFields?: string[];
  invalidTemplateFields?: string[];
  debug?: Record<string, unknown>;
};

type ProviderAttemptResult = {
  sendStatus: 'SENT' | 'FAILED';
  responsePayload: unknown;
  providerCode: string | null;
  providerMessage: string;
  httpStatus: number;
  tokenFingerprint: string | null;
  tokenSource: string;
  configRecordId: string | null;
  deliveryChannel: 'PHONE' | 'UID';
  sendUrl: string;
  authHeaderMode: 'access_token';
};

type RefreshTokenResult = {
  success: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  providerCode?: string | null;
  providerMessage: string;
  responsePayload?: unknown;
  persisted: boolean;
  persistMode: 'database' | 'env-only' | 'disabled';
  accessTokenFingerprint?: string | null;
  refreshTokenFingerprint?: string | null;
  refreshedAt?: string | null;
  configRecordId?: string | null;
  tokenSource?: string;
};

type TokenResolutionResult = {
  success: boolean;
  config: ResolvedZaloConfig;
  accessToken?: string | null;
  tokenSource: string;
  sendTokenFingerprint: string | null;
  refreshedTokenFingerprint: string | null;
  refreshTokenFingerprint: string | null;
  configRecordId: string | null;
  refreshedAt: string | null;
  refreshAttempted: boolean;
  staleTokenDetected: boolean;
  providerCode?: string | null;
  providerMessage?: string;
  responsePayload?: unknown;
};

type PreparedProviderSendRequest = {
  deliveryChannel: 'PHONE' | 'UID';
  sendUrl: string;
  payload: Record<string, unknown>;
  authHeaderMode: 'access_token';
  normalizedRecipientPhone: string | null;
  recipientUserId: string | null;
};

type TemplatePayloadValidationResult = {
  missingTemplateFields: string[];
  invalidTemplateFields: string[];
  validationMessage: string | null;
};

@Injectable()
export class ZaloNotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly websiteSettingsService: WebsiteSettingsService,
    private readonly zaloSettingsService: ZaloSettingsService,
  ) {}

  async getStatus(actor?: AuthenticatedUser) {
    return this.redactSettings(await this.buildStatusResponse(), actor);
  }

  async getSettings(actor?: AuthenticatedUser) {
    return this.redactSettings(await this.buildStatusResponse(), actor);
  }

  async updateSettings(dto: UpdateZaloSettingsDto, actorId: string) {
    return this.zaloSettingsService.updateSettings(dto, actorId);
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
      ...(this.extractLatestLogDiagnostics(log.responsePayload)
        ? { debug: this.extractLatestLogDiagnostics(log.responsePayload) }
        : {}),
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

  async testConnection(dto: TestZaloConnectionDto, actorId?: string) {
    const config = await this.zaloSettingsService.resolveConfig();
    const recipientPhone = this.normalizePhoneNumber(dto.phone || '');
    const templateId = config.templateIds.INVOICE;
    const now = new Date();
    const approvedTemplateDateValue = this.formatApprovedTemplate560202DateParam({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
    const requestPayload = {
      phone: recipientPhone,
      template_id: templateId,
      template_data: this.buildInvoiceTemplatePayloadForTemplate({
        templateId,
        customerName: 'Hu\u1ef3nh Anh T\u00fa',
        contractNumber: 'MKSL002',
        transferAmount: this.formatCurrencyForPayload(1749600),
        bankTransferNote: 'Ti\u1ec1n \u0111i\u1ec7n test th\u00e1ng 2',
        year: approvedTemplateDateValue,
        month: approvedTemplateDateValue,
        price: this.formatCurrencyForPayload(1749600),
        kwh: this.formatKwhForApprovedTemplate(720),
      }),
      tracking_id: `TEST-${Date.now()}`,
      mode: 'development',
    };

    if (!recipientPhone) {
      const result = await this.logAndReturnResult({
        actorId,
        customerName: 'Admin test Zalo',
        customerId: null,
        templateType: 'TEST',
        templateId,
        recipientPhone: '',
        dryRun: true,
        requestPayload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_PHONE',
        providerMessage:
          'Can nhap so dien thoai test de kiem tra ket noi Zalo.',
        missingRequired: config.missingRequired,
        missingRecommended: config.missingRecommended,
      });

      await this.zaloSettingsService.recordTestResult({
        actorId,
        status: result.status,
        message: result.providerMessage || 'Test Zalo bi chan vi thieu so dien thoai.',
      });

      return result;
    }

    const result = await this.sendTemplatePayload({
      actorId,
      customerId: null,
      customerName: 'Admin test Zalo',
      templateType: 'TEST',
      templateId,
      recipientPhone,
      requestPayload,
      config,
      forceDryRun: dto.dryRun,
      dryRunMissingMessage:
        'Dry-run: test ket noi dang duoc chay an toan tren moi truong hien tai.',
    });

    await this.zaloSettingsService.recordTestResult({
      actorId,
      status: result.status,
      message:
        result.providerMessage ||
        (result.success ? 'Test ket noi Zalo thanh cong.' : 'Test ket noi Zalo that bai.'),
    });

    return result;
  }

  async sendOtpTemplate(options: {
    actorId?: string;
    phone: string;
    otpCode: string;
    requestId: string;
    purpose:
      | 'CUSTOMER_LOGIN'
      | 'CUSTOMER_REGISTER'
      | 'CUSTOMER_PASSWORD_RESET'
      | 'CUSTOMER_PHONE_VERIFICATION'
      | 'CUSTOMER_SENSITIVE_ACTION';
    customerName?: string | null;
    expiresInMinutes?: number;
    dryRun?: boolean;
  }) {
    const config = await this.zaloSettingsService.resolveConfig();
    const recipientPhone = this.normalizePhoneNumber(options.phone || '');
    const templateId = config.templateIds.OTP;
    const expiresInMinutes = Math.max(1, Number(options.expiresInMinutes || 5));
    const shouldUseDevelopmentMode = Boolean(options.dryRun || config.dryRun);
    const requestPayload = {
      phone: recipientPhone,
      template_id: templateId,
      template_data: this.buildOtpTemplatePayload({
        otpCode: options.otpCode,
        expiresInMinutes,
        customerName: options.customerName || 'Quy khach',
        purpose: options.purpose,
      }),
      tracking_id: options.requestId,
      ...(shouldUseDevelopmentMode ? { mode: 'development' } : {}),
    };

    if (!recipientPhone) {
      return this.logAndReturnResult({
        actorId: options.actorId,
        customerId: null,
        customerName: options.customerName || 'Quy khach',
        templateType: 'OTP',
        templateId,
        recipientPhone: '',
        dryRun: true,
        requestPayload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_PHONE',
        providerMessage: 'Can co so dien thoai de gui ma OTP qua Zalo.',
        missingRequired: config.missingRequired,
        missingRecommended: config.missingRecommended,
      });
    }

    if (!templateId) {
      return this.logAndReturnResult({
        actorId: options.actorId,
        customerId: null,
        customerName: options.customerName || 'Quy khach',
        templateType: 'OTP',
        templateId,
        recipientPhone,
        dryRun: true,
        requestPayload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_TEMPLATE_OTP',
        providerMessage: 'Chua cau hinh ZALO_TEMPLATE_OTP_ID cho luong OTP.',
        missingRequired: config.missingRequired,
        missingRecommended: [
          ...(config.missingRecommended || []),
          'ZALO_TEMPLATE_OTP_ID',
        ],
      });
    }

    return this.sendTemplatePayload({
      actorId: options.actorId,
      customerId: null,
      customerName: options.customerName || 'Quy khach',
      templateType: 'OTP',
      templateId,
      recipientPhone,
      requestPayload,
      config,
      forceDryRun: options.dryRun,
      dryRunMissingMessage:
        'Dry-run: OTP Zalo dang duoc test an toan tren moi truong hien tai.',
    });
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
    const config = await this.zaloSettingsService.resolveConfig();
    const recipientPhone = this.normalizePhoneNumber(
      options.recipientPhone || invoice.customer?.user?.phone || '',
    );
    const hotline = await this.resolveHotline();
    const templateId = config.templateIds[templateType];
    const billableConsumption =
      Number(invoice.monthlyPvBilling?.billableKwh || 0) ||
      Number(invoice.monthlyPvBilling?.pvGenerationKwh || 0);
    const outstandingAmount = Math.max(
      Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0),
      0,
    );
    const bankTransferNote = this.buildApprovedTemplate560202TransferNote({
      templateId,
      customerName:
        invoice.customer?.companyName?.trim() ||
        invoice.customer?.user?.fullName?.trim() ||
        null,
      systemName: invoice.contract?.solarSystem?.name?.trim() || null,
      month: invoice.billingMonth,
    });
    const approvedTemplateDateValue = this.formatApprovedTemplate560202DateParam({
      year: invoice.billingYear,
      month: invoice.billingMonth,
    });
    const payloadVariables = this.buildInvoiceTemplatePayloadForTemplate({
      templateId,
      customerName:
        invoice.customer?.companyName?.trim() ||
        invoice.customer?.user?.fullName?.trim() ||
        'Quy khach',
      contractNumber: invoice.contract?.contractNumber || '',
      transferAmount: this.formatCurrencyForPayload(outstandingAmount),
      bankTransferNote,
      year: approvedTemplateDateValue,
      month: approvedTemplateDateValue,
      price: this.formatCurrencyForPayload(outstandingAmount),
      kwh: this.formatKwhForApprovedTemplate(billableConsumption),
      paymentLink: this.buildPaymentLink(invoice.id),
      hotline,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '',
      billingMonthLabel: `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`,
    });

    const requestPayload = {
      phone: recipientPhone,
      template_id: templateId,
      template_data: payloadVariables,
      tracking_id: invoice.invoiceNumber,
    };

    if (!recipientPhone) {
      return this.logAndReturnResult({
        invoice,
        actorId: options.actorId,
        customerId: invoice.customerId,
        customerName:
          invoice.customer?.companyName ||
          invoice.customer?.user?.fullName ||
          'Quy khach',
        templateType,
        templateId,
        recipientPhone: '',
        dryRun: true,
        requestPayload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_PHONE',
        providerMessage: 'Khach hang chua co so dien thoai de gui thong bao Zalo.',
        missingRequired: config.missingRequired,
        missingRecommended: config.missingRecommended,
      });
    }

    return this.sendTemplatePayload({
      actorId: options.actorId,
      invoice,
      customerId: invoice.customerId,
      customerName:
        invoice.customer?.companyName ||
        invoice.customer?.user?.fullName ||
        'Quy khach',
      templateType,
      templateId,
      recipientPhone,
      requestPayload,
      config,
      forceDryRun: options.dryRun,
      dryRunMissingMessage:
        'Dry-run: gui that dang bi tat trong moi truong hien tai.',
    });
  }

  private async buildStatusResponse() {
    const [settings, tokenState, latestLog] = await Promise.all([
      this.zaloSettingsService.getSettings(),
      this.getValidZaloAccessToken({
        purpose: 'DIAGNOSTICS',
        allowRefresh: false,
      }),
      this.prisma.zaloMessageLog.findFirst({
        where: {
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      ...settings,
      configRecordId: tokenState.configRecordId || settings.configRecordId || null,
      tokenSourceUsed: tokenState.tokenSource || settings.accessTokenSource || 'missing',
      accessTokenFingerprint:
        tokenState.sendTokenFingerprint || settings.accessTokenFingerprint || null,
      refreshTokenFingerprint:
        tokenState.refreshTokenFingerprint || settings.refreshTokenFingerprint || null,
      tokenDiagnostics: {
        status: tokenState.success ? 'READY' : 'BLOCKED',
        tokenSource: tokenState.tokenSource || settings.accessTokenSource || 'missing',
        configRecordId: tokenState.configRecordId || settings.configRecordId || null,
        sendTokenFingerprint: tokenState.sendTokenFingerprint,
        refreshedTokenFingerprint: tokenState.refreshedTokenFingerprint,
        refreshTokenFingerprint: tokenState.refreshTokenFingerprint,
        refreshedAt: tokenState.refreshedAt,
        refreshAttempted: tokenState.refreshAttempted,
        staleTokenDetected: tokenState.staleTokenDetected,
        providerCode: tokenState.providerCode || null,
        providerMessage: tokenState.providerMessage || null,
      },
      latestSendDiagnostics: this.extractLatestLogDiagnostics(latestLog?.responsePayload),
    };
  }

  private redactSettings<T extends Record<string, any>>(settings: T, actor?: AuthenticatedUser): T {
    if (hasPermission(actor?.permissions, 'integration.secrets.view')) {
      return settings;
    }

    return {
      ...settings,
      appId: null,
      oaId: null,
      appSecretPreview: null,
      accessTokenPreview: null,
      refreshTokenPreview: null,
      accessTokenFingerprint: null,
      refreshTokenFingerprint: null,
      latestSendDiagnostics: settings.latestSendDiagnostics
        ? {
            ...settings.latestSendDiagnostics,
            refreshedTokenFingerprint: null,
            sendTokenFingerprint: null,
          }
        : settings.latestSendDiagnostics,
      tokenDiagnostics: settings.tokenDiagnostics
        ? {
            ...settings.tokenDiagnostics,
            refreshedTokenFingerprint: null,
            sendTokenFingerprint: null,
            refreshTokenFingerprint: null,
          }
        : settings.tokenDiagnostics,
    };
  }

  private async getValidZaloAccessToken(params: {
    actorId?: string;
    purpose: 'TEST' | 'INVOICE' | 'DIAGNOSTICS' | 'OTP';
    allowRefresh: boolean;
    config?: ResolvedZaloConfig;
    invalidTokenFingerprint?: string | null;
  }): Promise<TokenResolutionResult> {
    const config = params.config || (await this.zaloSettingsService.resolveConfig());
    const accessToken = config.accessToken?.trim() || null;
    const tokenFingerprint = this.fingerprintToken(accessToken);
    const shouldForceRefresh =
      params.allowRefresh &&
      config.autoRefreshEnabled &&
      (!accessToken ||
        config.accessTokenState === 'EXPIRED' ||
        config.accessTokenState === 'REJECTED' ||
        (params.invalidTokenFingerprint &&
          tokenFingerprint === params.invalidTokenFingerprint));

    if (!shouldForceRefresh) {
      if (accessToken) {
        return {
          success: true,
          config,
          accessToken,
          tokenSource: config.accessTokenSource,
          sendTokenFingerprint: tokenFingerprint,
          refreshedTokenFingerprint: null,
          refreshTokenFingerprint: config.refreshTokenFingerprint,
          configRecordId: config.configRecordId,
          refreshedAt: null,
          refreshAttempted: false,
          staleTokenDetected: false,
        };
      }

      return {
        success: false,
        config,
        accessToken: null,
        tokenSource: config.accessTokenSource,
        sendTokenFingerprint: tokenFingerprint,
        refreshedTokenFingerprint: null,
        refreshTokenFingerprint: config.refreshTokenFingerprint,
        configRecordId: config.configRecordId,
        refreshedAt: null,
        refreshAttempted: false,
        staleTokenDetected: false,
        providerCode: 'MISSING_ACCESS_TOKEN',
        providerMessage: 'Khong co access token hop le de gui thong bao Zalo.',
      };
    }

    const refreshOutcome = await this.tryRefreshAccessToken({
      config,
      actorId: params.actorId,
    });

    if (!refreshOutcome.success || !refreshOutcome.accessToken) {
      return {
        success: false,
        config,
        accessToken: null,
        tokenSource: config.accessTokenSource,
        sendTokenFingerprint: tokenFingerprint,
        refreshedTokenFingerprint: refreshOutcome.accessTokenFingerprint || null,
        refreshTokenFingerprint:
          refreshOutcome.refreshTokenFingerprint || config.refreshTokenFingerprint,
        configRecordId: refreshOutcome.configRecordId || config.configRecordId,
        refreshedAt: refreshOutcome.refreshedAt || null,
        refreshAttempted: true,
        staleTokenDetected: false,
        providerCode: refreshOutcome.providerCode || 'REFRESH_FAILED',
        providerMessage: refreshOutcome.providerMessage,
        responsePayload: refreshOutcome.responsePayload,
      };
    }

    const refreshedTokenFingerprint = refreshOutcome.accessTokenFingerprint || null;
    const refreshedAt = refreshOutcome.refreshedAt || new Date().toISOString();

    if (refreshOutcome.persistMode === 'database') {
      const latestConfig = await this.zaloSettingsService.resolveConfig();
      const latestAccessToken = latestConfig.accessToken?.trim() || null;
      const latestFingerprint = this.fingerprintToken(latestAccessToken);

      if (!latestAccessToken) {
        return {
          success: false,
          config: latestConfig,
          accessToken: null,
          tokenSource: latestConfig.accessTokenSource,
          sendTokenFingerprint: latestFingerprint,
          refreshedTokenFingerprint,
          refreshTokenFingerprint:
            refreshOutcome.refreshTokenFingerprint || latestConfig.refreshTokenFingerprint,
          configRecordId: latestConfig.configRecordId,
          refreshedAt,
          refreshAttempted: true,
          staleTokenDetected: true,
          providerCode: 'REFRESHED_TOKEN_MISSING',
          providerMessage: 'send flow is using stale token.',
          responsePayload: refreshOutcome.responsePayload,
        };
      }

      if (
        refreshedTokenFingerprint &&
        latestFingerprint &&
        refreshedTokenFingerprint !== latestFingerprint
      ) {
        return {
          success: false,
          config: latestConfig,
          accessToken: latestAccessToken,
          tokenSource: latestConfig.accessTokenSource,
          sendTokenFingerprint: latestFingerprint,
          refreshedTokenFingerprint,
          refreshTokenFingerprint:
            refreshOutcome.refreshTokenFingerprint || latestConfig.refreshTokenFingerprint,
          configRecordId: latestConfig.configRecordId,
          refreshedAt,
          refreshAttempted: true,
          staleTokenDetected: true,
          providerCode: 'STALE_TOKEN',
          providerMessage: 'send flow is using stale token.',
          responsePayload: refreshOutcome.responsePayload,
        };
      }

      return {
        success: true,
        config: latestConfig,
        accessToken: latestAccessToken,
        tokenSource: latestConfig.accessTokenSource,
        sendTokenFingerprint: latestFingerprint,
        refreshedTokenFingerprint,
        refreshTokenFingerprint:
          refreshOutcome.refreshTokenFingerprint || latestConfig.refreshTokenFingerprint,
        configRecordId: latestConfig.configRecordId,
        refreshedAt,
        refreshAttempted: true,
        staleTokenDetected: false,
        responsePayload: refreshOutcome.responsePayload,
      };
    }

    return {
      success: true,
      config: {
        ...config,
        accessToken: refreshOutcome.accessToken,
        refreshToken: refreshOutcome.refreshToken || config.refreshToken,
        accessTokenExpiresAt: refreshOutcome.accessTokenExpiresAt
          ? refreshOutcome.accessTokenExpiresAt.toISOString()
          : config.accessTokenExpiresAt,
      },
      accessToken: refreshOutcome.accessToken,
      tokenSource: refreshOutcome.tokenSource || `runtime-refresh:${refreshOutcome.persistMode}`,
      sendTokenFingerprint: refreshedTokenFingerprint,
      refreshedTokenFingerprint,
      refreshTokenFingerprint:
        refreshOutcome.refreshTokenFingerprint || config.refreshTokenFingerprint,
      configRecordId: refreshOutcome.configRecordId || config.configRecordId,
      refreshedAt,
      refreshAttempted: true,
      staleTokenDetected: false,
      responsePayload: refreshOutcome.responsePayload,
    };
  }

  private buildTokenDebug(params: {
    resolution: TokenResolutionResult;
    templateType: ZaloTemplateType | 'TEST';
  }) {
    return {
      token_source: params.resolution.tokenSource,
      config_record_id: params.resolution.configRecordId,
      refreshed_token_fingerprint: params.resolution.refreshedTokenFingerprint,
      send_token_fingerprint: params.resolution.sendTokenFingerprint,
      refresh_token_fingerprint: params.resolution.refreshTokenFingerprint,
      refreshed_at: params.resolution.refreshedAt,
      refresh_attempted: params.resolution.refreshAttempted,
      stale_token_detected: params.resolution.staleTokenDetected,
      template_type: params.templateType,
    } satisfies Record<string, unknown>;
  }

  private buildSendDebug(params: {
    resolution: TokenResolutionResult;
    preparedRequest: PreparedProviderSendRequest;
    templateType: ZaloTemplateType | 'TEST';
    primaryAttempt?: ProviderAttemptResult | null;
  }) {
    return {
      ...this.buildTokenDebug({
        resolution: params.resolution,
        templateType: params.templateType,
      }),
      delivery_channel: params.preparedRequest.deliveryChannel,
      send_url: params.primaryAttempt?.sendUrl || params.preparedRequest.sendUrl,
      auth_header_mode:
        params.primaryAttempt?.authHeaderMode || params.preparedRequest.authHeaderMode,
      recipient_phone: params.preparedRequest.normalizedRecipientPhone,
      recipient_user_id_preview: params.preparedRequest.recipientUserId
        ? maskSecret(params.preparedRequest.recipientUserId, 3, 3)
        : null,
      request_keys: Object.keys(params.preparedRequest.payload || {}),
    } satisfies Record<string, unknown>;
  }

  private extractLatestLogDiagnostics(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const debug = source.debug;

    if (!debug || typeof debug !== 'object' || Array.isArray(debug)) {
      return null;
    }

    const diagnostics = debug as Record<string, unknown>;
    return {
      tokenSource: typeof diagnostics.token_source === 'string' ? diagnostics.token_source : null,
      configRecordId:
        typeof diagnostics.config_record_id === 'string'
          ? diagnostics.config_record_id
          : null,
      refreshedTokenFingerprint:
        typeof diagnostics.refreshed_token_fingerprint === 'string'
          ? diagnostics.refreshed_token_fingerprint
          : null,
      sendTokenFingerprint:
        typeof diagnostics.send_token_fingerprint === 'string'
          ? diagnostics.send_token_fingerprint
          : null,
      refreshTokenFingerprint:
        typeof diagnostics.refresh_token_fingerprint === 'string'
          ? diagnostics.refresh_token_fingerprint
          : null,
      refreshedAt:
        typeof diagnostics.refreshed_at === 'string' ? diagnostics.refreshed_at : null,
      staleTokenDetected: diagnostics.stale_token_detected === true,
      deliveryChannel:
        typeof diagnostics.delivery_channel === 'string'
          ? diagnostics.delivery_channel
          : null,
      sendUrl: typeof diagnostics.send_url === 'string' ? diagnostics.send_url : null,
      authHeaderMode:
        typeof diagnostics.auth_header_mode === 'string'
          ? diagnostics.auth_header_mode
          : null,
    };
  }

  private async sendTemplatePayload(params: {
    actorId?: string;
    invoice?: any | null;
    customerId?: string | null;
    customerName: string;
    templateType: ZaloTemplateType | 'TEST';
    templateId: string | null;
    recipientPhone: string;
    requestPayload: Record<string, unknown>;
    config: ResolvedZaloConfig;
    forceDryRun?: boolean;
    dryRunMissingMessage: string;
  }) {
    const preparedRequest = this.prepareProviderSendRequest({
      config: params.config,
      requestPayload: params.requestPayload,
      recipientPhone: params.recipientPhone,
    });
    const templateValidation = this.validateTemplatePayload({
      templateId: params.templateId,
      templateData:
        this.extractObjectValue(params.requestPayload, ['template_data', 'templateData']) || {},
    });

    if (
      templateValidation.missingTemplateFields.length > 0 ||
      templateValidation.invalidTemplateFields.length > 0
    ) {
      return this.logAndReturnResult({
        invoice: params.invoice || null,
        actorId: params.actorId,
        customerId: params.customerId || null,
        customerName: params.customerName,
        templateType: params.templateType,
        templateId: params.templateId,
        recipientPhone: preparedRequest.normalizedRecipientPhone || params.recipientPhone,
        dryRun: Boolean(params.forceDryRun || params.config.dryRun),
        requestPayload: preparedRequest.payload,
        sendStatus: 'BLOCKED',
        providerCode: 'MISSING_TEMPLATE_FIELDS',
        providerMessage:
          templateValidation.validationMessage ||
          'Khong the gui Zalo vi thieu bien template bat buoc.',
        responsePayload: {
          validation: {
            templateId: params.templateId,
            missingTemplateFields: templateValidation.missingTemplateFields,
            invalidTemplateFields: templateValidation.invalidTemplateFields,
          },
        },
        missingRequired: params.config.missingRequired,
        missingRecommended: params.config.missingRecommended,
        missingTemplateFields: templateValidation.missingTemplateFields,
        invalidTemplateFields: templateValidation.invalidTemplateFields,
      });
    }
    const effectiveDryRun =
      params.forceDryRun === true ||
      params.config.dryRun ||
      params.config.missingRequired.length > 0;

    if (effectiveDryRun) {
      const tokenResolution = await this.getValidZaloAccessToken({
        actorId: params.actorId,
        purpose: params.templateType === 'TEST' ? 'TEST' : 'INVOICE',
        allowRefresh: false,
        config: params.config,
      });

      return this.logAndReturnResult({
        invoice: params.invoice || null,
        actorId: params.actorId,
        customerId: params.customerId || null,
        customerName: params.customerName,
        templateType: params.templateType,
        templateId: params.templateId,
        recipientPhone: preparedRequest.normalizedRecipientPhone || params.recipientPhone,
        dryRun: true,
        requestPayload: preparedRequest.payload,
        sendStatus: 'DRY_RUN',
        providerCode: params.config.missingRequired.length > 0 ? 'MISSING_CONFIG' : 'DRY_RUN',
        providerMessage:
          params.config.missingRequired.length > 0
            ? `Dry-run: thieu cau hinh Zalo (${params.config.missingRequired.join(', ')}).`
            : params.dryRunMissingMessage,
        responsePayload: {
          simulated: true,
          missingRequired: params.config.missingRequired,
          missingRecommended: params.config.missingRecommended,
          accessTokenSource: params.config.accessTokenSource,
          refreshTokenSource: params.config.refreshTokenSource,
          autoRefreshEnabled: params.config.autoRefreshEnabled,
          debug: this.buildSendDebug({
            resolution: tokenResolution,
            preparedRequest,
            templateType: params.templateType,
          }),
        },
        missingRequired: params.config.missingRequired,
        missingRecommended: params.config.missingRecommended,
        debug: this.buildSendDebug({
          resolution: tokenResolution,
          preparedRequest,
          templateType: params.templateType,
        }),
      });
    }

    const tokenResolution = await this.getValidZaloAccessToken({
      actorId: params.actorId,
      purpose: params.templateType === 'TEST' ? 'TEST' : 'INVOICE',
      allowRefresh: true,
      config: params.config,
    });

    if (
      !tokenResolution.success ||
      !tokenResolution.accessToken ||
      tokenResolution.staleTokenDetected
    ) {
      return this.logAndReturnResult({
        invoice: params.invoice || null,
        actorId: params.actorId,
        customerId: params.customerId || null,
        customerName: params.customerName,
        templateType: params.templateType,
        templateId: params.templateId,
        recipientPhone: preparedRequest.normalizedRecipientPhone || params.recipientPhone,
        dryRun: false,
        requestPayload: preparedRequest.payload,
        sendStatus: 'FAILED',
        providerCode: tokenResolution.providerCode || 'MISSING_ACCESS_TOKEN',
        providerMessage:
          tokenResolution.providerMessage ||
          'Khong co access token hop le de gui thong bao Zalo.',
        missingRequired: tokenResolution.config.missingRequired,
        missingRecommended: tokenResolution.config.missingRecommended,
        responsePayload: tokenResolution.responsePayload,
        debug: this.buildSendDebug({
          resolution: tokenResolution,
          preparedRequest,
          templateType: params.templateType,
        }),
      });
    }

    const primaryAttempt = await this.performProviderSend({
      accessToken: tokenResolution.accessToken,
      config: tokenResolution.config,
      preparedRequest,
      tokenSource: tokenResolution.tokenSource,
      configRecordId: tokenResolution.configRecordId,
    });

    if (primaryAttempt.sendStatus === 'SENT') {
      await this.zaloSettingsService.recordTokenStatus({
        actorId: params.actorId,
        status: 'AVAILABLE',
        message: 'Access token duoc Zalo chap nhan.',
        accessTokenExpiresAt: tokenResolution.config.accessTokenExpiresAt
          ? new Date(tokenResolution.config.accessTokenExpiresAt)
          : null,
      });

      return this.logAndReturnResult({
        invoice: params.invoice || null,
        actorId: params.actorId,
        customerId: params.customerId || null,
        customerName: params.customerName,
        templateType: params.templateType,
        templateId: params.templateId,
        recipientPhone: preparedRequest.normalizedRecipientPhone || params.recipientPhone,
        dryRun: false,
        requestPayload: preparedRequest.payload,
        responsePayload: primaryAttempt.responsePayload,
        sendStatus: primaryAttempt.sendStatus,
        providerCode: primaryAttempt.providerCode,
        providerMessage: primaryAttempt.providerMessage,
        missingRequired: tokenResolution.config.missingRequired,
        missingRecommended: tokenResolution.config.missingRecommended,
        debug: this.buildSendDebug({
          resolution: {
            ...tokenResolution,
            sendTokenFingerprint: primaryAttempt.tokenFingerprint,
            tokenSource: primaryAttempt.tokenSource,
            configRecordId: primaryAttempt.configRecordId,
          },
          preparedRequest,
          primaryAttempt,
          templateType: params.templateType,
        }),
      });
    }

    return this.handleProviderFailure({
      actorId: params.actorId,
      config: tokenResolution.config,
      invoice: params.invoice || null,
      customerId: params.customerId || null,
      customerName: params.customerName,
      templateType: params.templateType,
      templateId: params.templateId,
      recipientPhone: preparedRequest.normalizedRecipientPhone || params.recipientPhone,
      requestPayload: preparedRequest.payload,
      preparedRequest,
      primaryAttempt,
    });
  }

  private async handleProviderFailure(params: {
    actorId?: string;
    config: ResolvedZaloConfig;
    invoice?: any | null;
    customerId?: string | null;
    customerName: string;
    templateType: ZaloTemplateType | 'TEST';
    templateId: string | null;
    recipientPhone: string;
    requestPayload: Record<string, unknown>;
    preparedRequest: PreparedProviderSendRequest;
    primaryAttempt: ProviderAttemptResult;
  }) {
    if (this.isTokenRejected(params.primaryAttempt) && params.config.autoRefreshEnabled) {
      await this.zaloSettingsService.recordTokenStatus({
        actorId: params.actorId,
        status: 'REJECTED',
        message: params.primaryAttempt.providerMessage,
      });

      const tokenResolution = await this.getValidZaloAccessToken({
        actorId: params.actorId,
        purpose: params.templateType === 'TEST' ? 'TEST' : 'INVOICE',
        allowRefresh: true,
        config: params.config,
        invalidTokenFingerprint: params.primaryAttempt.tokenFingerprint,
      });

      if (
        !tokenResolution.success ||
        !tokenResolution.accessToken ||
        tokenResolution.staleTokenDetected
      ) {
        return this.logAndReturnResult({
          invoice: params.invoice || null,
          actorId: params.actorId,
          customerId: params.customerId || null,
          customerName: params.customerName,
          templateType: params.templateType,
          templateId: params.templateId,
          recipientPhone: params.preparedRequest.normalizedRecipientPhone || params.recipientPhone,
          dryRun: false,
          requestPayload: params.preparedRequest.payload,
          responsePayload: {
            primaryAttempt: params.primaryAttempt.responsePayload,
            refresh: tokenResolution.responsePayload || null,
          },
          sendStatus: 'FAILED',
          providerCode: tokenResolution.providerCode || params.primaryAttempt.providerCode,
          providerMessage: tokenResolution.staleTokenDetected
            ? 'send flow is using stale token.'
            : `${params.primaryAttempt.providerMessage}. Auto-refresh that bai: ${tokenResolution.providerMessage}`,
          missingRequired: params.config.missingRequired,
          missingRecommended: params.config.missingRecommended,
          debug: this.buildSendDebug({
            resolution: tokenResolution,
            preparedRequest: params.preparedRequest,
            primaryAttempt: params.primaryAttempt,
            templateType: params.templateType,
          }),
        });
      }

      const retryAttempt = await this.performProviderSend({
        accessToken: tokenResolution.accessToken,
        config: tokenResolution.config,
        preparedRequest: params.preparedRequest,
        tokenSource: tokenResolution.tokenSource,
        configRecordId: tokenResolution.configRecordId,
      });

      if (retryAttempt.sendStatus === 'SENT') {
        await this.zaloSettingsService.recordTokenStatus({
          actorId: params.actorId,
          status: 'AVAILABLE',
          message: 'Access token duoc refresh va gui lai thanh cong.',
          accessTokenExpiresAt: tokenResolution.config.accessTokenExpiresAt
            ? new Date(tokenResolution.config.accessTokenExpiresAt)
            : null,
        });
      } else if (this.isTokenRejected(retryAttempt)) {
        await this.zaloSettingsService.recordTokenStatus({
          actorId: params.actorId,
          status: 'REJECTED',
          message: retryAttempt.providerMessage,
          accessTokenExpiresAt: tokenResolution.config.accessTokenExpiresAt
            ? new Date(tokenResolution.config.accessTokenExpiresAt)
            : null,
        });
      }

      return this.logAndReturnResult({
        invoice: params.invoice || null,
        actorId: params.actorId,
        customerId: params.customerId || null,
        customerName: params.customerName,
        templateType: params.templateType,
        templateId: params.templateId,
        recipientPhone: params.preparedRequest.normalizedRecipientPhone || params.recipientPhone,
        dryRun: false,
        requestPayload: params.preparedRequest.payload,
        responsePayload: {
          primaryAttempt: params.primaryAttempt.responsePayload,
          refresh: tokenResolution.responsePayload || null,
          retryAttempt: retryAttempt.responsePayload,
        },
        sendStatus: retryAttempt.sendStatus,
        providerCode: retryAttempt.providerCode,
        providerMessage:
          retryAttempt.sendStatus === 'SENT'
            ? `${retryAttempt.providerMessage} (Da auto-refresh access token)`
            : retryAttempt.providerMessage,
        missingRequired: params.config.missingRequired,
        missingRecommended: params.config.missingRecommended,
        debug: this.buildSendDebug({
          resolution: {
            ...tokenResolution,
            sendTokenFingerprint: retryAttempt.tokenFingerprint,
            tokenSource: retryAttempt.tokenSource,
            configRecordId: retryAttempt.configRecordId,
          },
          preparedRequest: params.preparedRequest,
          primaryAttempt: retryAttempt,
          templateType: params.templateType,
        }),
      });
    }

    if (this.isTokenRejected(params.primaryAttempt)) {
      await this.zaloSettingsService.recordTokenStatus({
        actorId: params.actorId,
        status: 'REJECTED',
        message: params.primaryAttempt.providerMessage,
      });
    }

    return this.logAndReturnResult({
      invoice: params.invoice || null,
      actorId: params.actorId,
      customerId: params.customerId || null,
      customerName: params.customerName,
      templateType: params.templateType,
      templateId: params.templateId,
      recipientPhone: params.preparedRequest.normalizedRecipientPhone || params.recipientPhone,
      dryRun: false,
      requestPayload: params.preparedRequest.payload,
      responsePayload: params.primaryAttempt.responsePayload,
      sendStatus: params.primaryAttempt.sendStatus,
      providerCode: params.primaryAttempt.providerCode,
      providerMessage: params.primaryAttempt.providerMessage,
      missingRequired: params.config.missingRequired,
      missingRecommended: params.config.missingRecommended,
      debug: this.buildSendDebug({
        resolution: {
          success: true,
          config: params.config,
          accessToken: null,
          tokenSource: params.primaryAttempt.tokenSource,
          sendTokenFingerprint: params.primaryAttempt.tokenFingerprint,
          refreshedTokenFingerprint: null,
          refreshTokenFingerprint: params.config.refreshTokenFingerprint,
          configRecordId: params.primaryAttempt.configRecordId,
          refreshedAt: null,
          refreshAttempted: false,
          staleTokenDetected: false,
        },
        preparedRequest: params.preparedRequest,
        primaryAttempt: params.primaryAttempt,
        templateType: params.templateType,
      }),
    });
  }

  private async performProviderSend(params: {
    accessToken: string;
    config: ResolvedZaloConfig;
    preparedRequest: PreparedProviderSendRequest;
    tokenSource: string;
    configRecordId: string | null;
  }): Promise<ProviderAttemptResult> {
    let response: Response;
    let responseBody: unknown = null;

    try {
      response = await fetch(params.preparedRequest.sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: params.accessToken,
        },
        body: JSON.stringify(params.preparedRequest.payload),
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

    return {
      sendStatus,
      responsePayload: responseBody,
      providerCode: normalizedProviderCode,
      providerMessage: normalizedProviderMessage,
      httpStatus: response.status,
      tokenFingerprint: this.fingerprintToken(params.accessToken),
      tokenSource: params.tokenSource,
      configRecordId: params.configRecordId,
      deliveryChannel: params.preparedRequest.deliveryChannel,
      sendUrl: params.preparedRequest.sendUrl,
      authHeaderMode: params.preparedRequest.authHeaderMode,
    };
  }

  private async tryRefreshAccessToken(params: {
    config: ResolvedZaloConfig;
    actorId?: string;
  }): Promise<RefreshTokenResult> {
    if (!params.config.autoRefreshEnabled) {
      await this.zaloSettingsService.recordRefreshResult({
        actorId: params.actorId,
        status: 'SKIPPED',
        message: 'Auto-refresh dang tat vi thieu refresh token, App ID hoac App Secret.',
      });

      return {
        success: false,
        providerCode: 'AUTO_REFRESH_DISABLED',
        providerMessage: 'Auto-refresh dang tat vi thieu refresh token, App ID hoac App Secret.',
        persisted: false,
        persistMode: 'disabled',
      };
    }

    const refreshUrl = this.buildRefreshUrl(params.config.oauthBaseUrl);
    const requestBody = new URLSearchParams({
      app_id: params.config.appId || '',
      refresh_token: params.config.refreshToken || '',
      grant_type: 'refresh_token',
    });

    let response: Response;
    let responseBody: unknown = null;

    try {
      response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: params.config.appSecret || '',
        },
        body: requestBody.toString(),
      });
    } catch (error) {
      const providerMessage =
        error instanceof Error
          ? `Khong the refresh token Zalo: ${error.message}`
          : 'Khong the refresh token Zalo.';

      await this.zaloSettingsService.recordRefreshResult({
        actorId: params.actorId,
        status: 'FAILED',
        message: providerMessage,
        nextTokenState: 'REJECTED',
      });

      return {
        success: false,
        providerCode: 'REFRESH_REQUEST_FAILED',
        providerMessage,
        persisted: false,
        persistMode: params.config.autoRefreshPersistMode,
      };
    }

    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    const normalizedResponse = this.unwrapRefreshPayload(responseBody);
    const providerCode = this.extractProviderCode(normalizedResponse);
    const providerMessage =
      this.extractProviderMessage(normalizedResponse) ||
      (response.ok
        ? 'Zalo OAuth da tra ve access token moi.'
        : `HTTP ${response.status}`);
    const accessToken = this.extractStringValue(normalizedResponse, [
      'access_token',
      'accessToken',
    ]);

    if (!response.ok || !accessToken) {
      await this.zaloSettingsService.recordRefreshResult({
        actorId: params.actorId,
        status: 'FAILED',
        message: providerMessage,
        nextTokenState: 'REJECTED',
      });

      return {
        success: false,
        providerCode,
        providerMessage,
        responsePayload: normalizedResponse,
        persisted: false,
        persistMode: params.config.autoRefreshPersistMode,
      };
    }

    const refreshToken =
      this.extractStringValue(normalizedResponse, ['refresh_token', 'refreshToken']) ||
      params.config.refreshToken;
    const expiresInSeconds = this.extractNumericValue(normalizedResponse, [
      'expires_in',
      'expiresIn',
      'expires',
    ]);
    const accessTokenExpiresAt =
      expiresInSeconds && Number.isFinite(expiresInSeconds)
        ? new Date(Date.now() + expiresInSeconds * 1000)
        : null;

    const persisted = await this.zaloSettingsService.persistRefreshedTokens({
      actorId: params.actorId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
    });

    return {
      success: true,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      providerCode,
      providerMessage,
      responsePayload: normalizedResponse,
      persisted: persisted.persisted,
      persistMode: persisted.persistMode,
      accessTokenFingerprint: this.fingerprintToken(accessToken),
      refreshTokenFingerprint: this.fingerprintToken(refreshToken),
      refreshedAt: new Date().toISOString(),
      configRecordId: params.config.configRecordId,
      tokenSource:
        persisted.persistMode === 'database'
          ? 'database'
          : `runtime-refresh:${persisted.persistMode}`,
    };
  }

  private async logAndReturnResult(params: SendExecutionParams) {
    const responsePayloadWithDebug =
      params.debug && params.responsePayload && typeof params.responsePayload === 'object'
        ? {
            ...(params.responsePayload as Record<string, unknown>),
            debug: params.debug,
          }
        : params.debug
          ? { debug: params.debug }
          : params.responsePayload;
    const responsePayloadWithValidation =
      (params.missingTemplateFields?.length || params.invalidTemplateFields?.length) &&
      responsePayloadWithDebug &&
      typeof responsePayloadWithDebug === 'object' &&
      !Array.isArray(responsePayloadWithDebug)
        ? {
            ...(responsePayloadWithDebug as Record<string, unknown>),
            validation: {
              missingTemplateFields: params.missingTemplateFields || [],
              invalidTemplateFields: params.invalidTemplateFields || [],
            },
          }
        : (params.missingTemplateFields?.length || params.invalidTemplateFields?.length)
          ? {
              validation: {
                missingTemplateFields: params.missingTemplateFields || [],
                invalidTemplateFields: params.invalidTemplateFields || [],
              },
              ...(params.debug ? { debug: params.debug } : {}),
            }
          : responsePayloadWithDebug;

    const log = await this.prisma.zaloMessageLog.create({
      data: {
        invoiceId: params.invoice?.id || params.invoice?.invoiceId || null,
        customerId:
          params.customerId ||
          params.invoice?.customerId ||
          null,
        customerName: params.customerName,
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
          responsePayloadWithValidation !== undefined
            ? ((responsePayloadWithValidation as Prisma.InputJsonValue) ?? Prisma.JsonNull)
            : Prisma.JsonNull,
      },
    });

    await this.auditLogsService.log({
      userId: params.actorId,
      action:
        params.templateType === 'TEST'
          ? 'ZALO_TEST_CONNECTION_SENT'
          : params.templateType === 'OTP'
            ? 'ZALO_OTP_SENT'
          : 'ZALO_INVOICE_NOTIFICATION_SENT',
      entityType: 'ZaloMessageLog',
      entityId: log.id,
      payload: {
        invoiceId: params.invoice?.id || null,
        invoiceNumber: params.invoice?.invoiceNumber || null,
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
      invoiceId: params.invoice?.id || null,
      invoiceNumber: params.invoice?.invoiceNumber || null,
      customerName: params.customerName,
      recipientPhone: params.recipientPhone || null,
      templateType: params.templateType,
      templateId: params.templateId,
      providerCode: params.providerCode || null,
      providerMessage: params.providerMessage,
      missingRequired: params.missingRequired || [],
      missingRecommended: params.missingRecommended || [],
      missingTemplateFields: params.missingTemplateFields || [],
      invalidTemplateFields: params.invalidTemplateFields || [],
      logId: log.id,
      sentAt: log.createdAt.toISOString(),
      requestPayload: params.requestPayload || null,
      responsePayload: responsePayloadWithValidation || null,
      debug: params.debug || null,
    };
  }

  private prepareProviderSendRequest(params: {
    config: ResolvedZaloConfig;
    requestPayload: Record<string, unknown>;
    recipientPhone?: string | null;
  }): PreparedProviderSendRequest {
    const recipientUserId = this.extractStringValue(params.requestPayload, ['user_id', 'userId']);
    const templateId = this.extractStringValue(params.requestPayload, ['template_id', 'templateId']);
    const trackingId = this.extractStringValue(params.requestPayload, ['tracking_id', 'trackingId']);
    const mode = this.extractStringValue(params.requestPayload, ['mode']);
    const templateData =
      this.extractObjectValue(params.requestPayload, ['template_data', 'templateData']) || {};
    const normalizedRecipientPhone = this.normalizePhoneNumberForZns(
      this.extractStringValue(params.requestPayload, ['phone']) || params.recipientPhone || '',
    );

    if (recipientUserId) {
      return {
        deliveryChannel: 'UID',
        sendUrl: this.buildOaSendUrl(params.config.apiBaseUrl),
        payload: {
          user_id: recipientUserId,
          template_id: templateId || '',
          template_data: templateData,
          ...(trackingId ? { tracking_id: trackingId } : {}),
        },
        authHeaderMode: 'access_token',
        normalizedRecipientPhone: null,
        recipientUserId,
      };
    }

    return {
      deliveryChannel: 'PHONE',
      sendUrl: this.buildZnsSendUrl(),
      payload: {
        phone: normalizedRecipientPhone,
        template_id: templateId || '',
        template_data: templateData,
        ...(trackingId ? { tracking_id: trackingId } : {}),
        ...(mode === 'development' ? { mode } : {}),
      },
      authHeaderMode: 'access_token',
      normalizedRecipientPhone: normalizedRecipientPhone || null,
      recipientUserId: null,
    };
  }

  private buildOaSendUrl(apiBaseUrl: string) {
    const trimmed = apiBaseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/message/template')
      ? trimmed
      : `${trimmed}/message/template`;
  }

  private buildZnsSendUrl() {
    const fromEnv = this.configService.get<string>('ZALO_ZNS_API_BASE_URL')?.trim();
    const baseUrl = fromEnv || 'https://business.openapi.zalo.me';
    const trimmed = baseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/message/template')
      ? trimmed
      : `${trimmed}/message/template`;
  }

  private buildRefreshUrl(oauthBaseUrl: string) {
    const trimmed = oauthBaseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/access_token')
      ? trimmed
      : `${trimmed}/access_token`;
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

  private isApprovedInvoiceTemplate560202(templateId: string | null | undefined) {
    return String(templateId || '').trim() === '560202';
  }

  private buildInvoiceTemplatePayloadForTemplate(params: {
    templateId?: string | null;
    customerName: string;
    contractNumber: string;
    transferAmount: string;
    bankTransferNote: string;
    year: string;
    month: string;
    price: string;
    kwh: string;
    paymentLink?: string;
    hotline?: string;
    dueDate?: string;
    billingMonthLabel?: string;
  }) {
    if (this.isApprovedInvoiceTemplate560202(params.templateId)) {
      return {
        customer_name: params.customerName,
        contract_number: params.contractNumber,
        transfer_amount: params.transferAmount,
        bank_transfer_note: params.bankTransferNote,
        year: params.year,
        month: params.month,
        price: params.price,
        kwh: params.kwh,
      } satisfies Record<string, string>;
    }

    return {
      customer_name: params.customerName,
      billing_month: params.billingMonthLabel || `${params.month}/${params.year}`,
      consumption_kwh: params.kwh,
      amount_due: params.transferAmount,
      due_date: params.dueDate || '',
      payment_link: params.paymentLink || '',
      hotline: params.hotline || '',
    } satisfies Record<string, string>;
  }

  private buildOtpTemplatePayload(params: {
    otpCode: string;
    expiresInMinutes: number;
    customerName: string;
    purpose:
      | 'CUSTOMER_LOGIN'
      | 'CUSTOMER_REGISTER'
      | 'CUSTOMER_PASSWORD_RESET'
      | 'CUSTOMER_PHONE_VERIFICATION'
      | 'CUSTOMER_SENSITIVE_ACTION';
  }) {
    const purposeLabel =
      params.purpose === 'CUSTOMER_REGISTER'
        ? 'register'
        : params.purpose === 'CUSTOMER_PASSWORD_RESET'
          ? 'password_reset'
          : params.purpose === 'CUSTOMER_PHONE_VERIFICATION'
            ? 'phone_verification'
            : params.purpose === 'CUSTOMER_SENSITIVE_ACTION'
              ? 'step_up'
              : 'login';

    return {
      otp_code: params.otpCode,
      otp: params.otpCode,
      customer_name: params.customerName,
      expires_in_minutes: String(params.expiresInMinutes),
      purpose: purposeLabel,
    } satisfies Record<string, string>;
  }

  private validateTemplatePayload(params: {
    templateId: string | null;
    templateData: Record<string, unknown>;
  }): TemplatePayloadValidationResult {
    if (!this.isApprovedInvoiceTemplate560202(params.templateId)) {
      return {
        missingTemplateFields: [],
        invalidTemplateFields: [],
        validationMessage: null,
      };
    }

    const requiredFields = [
      'customer_name',
      'contract_number',
      'transfer_amount',
      'bank_transfer_note',
      'year',
      'month',
      'price',
      'kwh',
    ] as const;

    const missingTemplateFields = requiredFields.filter((field) =>
      this.isMissingTemplateField(params.templateData[field]),
    );
    const invalidTemplateFields = requiredFields.filter((field) =>
      !missingTemplateFields.includes(field) &&
      !this.isValidTemplateFieldValue(field, params.templateData[field]),
    );

    const problems = [
      ...missingTemplateFields.map((field) => `thieu ${field}`),
      ...invalidTemplateFields.map((field) => `${field} khong dung dinh dang`),
    ];

    return {
      missingTemplateFields,
      invalidTemplateFields,
      validationMessage: problems.length
        ? `Khong the gui template 560202: ${problems.join(', ')}.`
        : null,
    };
  }

  private isMissingTemplateField(value: unknown) {
    if (value === null || value === undefined) {
      return true;
    }

    return String(value).trim().length === 0;
  }

  private isValidTemplateFieldValue(field: string, value: unknown) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return false;
    }

    switch (field) {
      case 'transfer_amount':
      case 'price':
        return /^\d+$/.test(normalized);
      case 'year':
      case 'month':
        return this.isValidApprovedTemplate560202DateParam(normalized);
      case 'kwh':
        return /^\d+(?:\.\d+)?$/.test(normalized);
      default:
        return true;
    }
  }

  private formatApprovedTemplate560202DateParam(params: {
    year?: number | string | null;
    month?: number | string | null;
    day?: number | string | null;
  }) {
    const year = Number(params.year);
    const month = Number(params.month);
    const day = Number(params.day ?? 1);

    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      return '';
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return '';
    }

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return '';
    }

    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
  }

  private isValidApprovedTemplate560202DateParam(value: string) {
    return /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/.test(value);
  }

  private formatKwhForApprovedTemplate(value: unknown) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return '0';
    }

    if (Math.abs(numeric - Math.round(numeric)) < 0.001) {
      return String(Math.round(numeric));
    }

    return numeric.toFixed(2).replace(/\.00$/, '');
  }

  private buildApprovedTemplate560202TransferNote(params: {
    templateId?: string | null;
    customerName?: string | null;
    systemName?: string | null;
    month?: number | null;
  }) {
    if (!this.isApprovedInvoiceTemplate560202(params.templateId)) {
      return '';
    }

    const scopeLabel = params.systemName?.trim() || params.customerName?.trim() || '';
    const monthLabel =
      params.month && Number.isFinite(params.month) ? String(params.month) : '';
    const base = scopeLabel
      ? `Ti\u1ec1n \u0111i\u1ec7n ${scopeLabel}`
      : 'Ti\u1ec1n \u0111i\u1ec7n';

    return `${base}${monthLabel ? ` th\u00e1ng ${monthLabel}` : ''}`.trim();
  }

  private async resolveBankTransferNote(params: {
    invoiceNumber?: string | null;
    customerCode?: string | null;
    contractNumber?: string | null;
    customerName?: string | null;
    billingMonth?: number | null;
    billingYear?: number | null;
  }) {
    const defaultTemplate = 'MOKA {{invoiceNumber}} {{customerCode}}';
    let noteTemplate = defaultTemplate;

    try {
      const setting = await this.websiteSettingsService.findPublicSite();
      const content = (setting.content || {}) as Record<string, any>;
      const rails = Array.isArray(content?.payments?.manual?.rails)
        ? (content.payments.manual.rails as Array<Record<string, unknown>>)
        : [];
      const preferredRail =
        rails.find(
          (rail) =>
            String(rail?.key || '').trim() === 'BANK_TRANSFER' &&
            rail?.isEnabled !== false,
        ) ||
        rails.find((rail) => rail?.isDefault === true && rail?.isEnabled !== false) ||
        rails.find((rail) => rail?.isEnabled !== false);

      const configuredTemplate =
        preferredRail && typeof preferredRail.noteTemplate === 'string'
          ? preferredRail.noteTemplate.trim()
          : '';

      if (configuredTemplate) {
        noteTemplate = configuredTemplate;
      }
    } catch {
      // Ignore website settings lookup errors and fallback below.
    }

    const replacements: Record<string, string> = {
      invoiceNumber: params.invoiceNumber?.trim() || '',
      customerCode: params.customerCode?.trim() || '',
      contractNumber: params.contractNumber?.trim() || '',
      customerName: params.customerName?.trim() || '',
      month: params.billingMonth ? String(params.billingMonth).padStart(2, '0') : '',
      year: params.billingYear ? String(params.billingYear) : '',
    };

    const rendered = noteTemplate.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token) => {
      const replacement = replacements[token] || '';
      return replacement;
    });

    return rendered.replace(/\s+/g, ' ').trim();
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

  private normalizePhoneNumberForZns(value: string) {
    const normalized = this.normalizePhoneNumber(value);
    return normalized.replace(/^\+/, '');
  }

  private formatDecimalForPayload(value: unknown) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2).replace(/\.00$/, '') : '0';
  }

  private formatCurrencyForPayload(value: number) {
    return Math.round(Number(value || 0)).toString();
  }

  private extractProviderCode(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const candidate =
      source.error ||
      source.code ||
      source.error_code ||
      source.status ||
      source.err;
    return candidate !== undefined && candidate !== null ? String(candidate) : null;
  }

  private extractProviderMessage(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const candidate =
      source.message ||
      source.msg ||
      source.error_message ||
      source.description ||
      source.error_name;
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

  private isTokenRejected(attempt: ProviderAttemptResult) {
    const providerCode = `${attempt.providerCode || ''}`.toLowerCase();
    const providerMessage = `${attempt.providerMessage || ''}`.toLowerCase();

    return (
      attempt.httpStatus === 401 ||
      attempt.httpStatus === 403 ||
      providerCode === '401' ||
      providerCode === '403' ||
      providerMessage.includes('access token is invalid') ||
      providerMessage.includes('invalid access token') ||
      providerMessage.includes('token is invalid') ||
      providerMessage.includes('token invalid') ||
      providerMessage.includes('expired token')
    );
  }

  private unwrapRefreshPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return payload;
    }

    const source = payload as Record<string, unknown>;
    const nested = source.data;

    if (typeof nested === 'string') {
      try {
        return JSON.parse(nested);
      } catch {
        return source;
      }
    }

    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested;
    }

    return source;
  }

  private extractStringValue(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const match = keys.find((key) => typeof source[key] === 'string' && source[key]);

    return match ? String(source[match]) : null;
  }

  private extractObjectValue(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const match = keys.find((key) => {
      const value = source[key];
      return value && typeof value === 'object' && !Array.isArray(value);
    });

    return match ? (source[match] as Record<string, unknown>) : null;
  }

  private extractNumericValue(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;

    for (const key of keys) {
      const numeric = Number(source[key]);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }

    return null;
  }

  private fingerprintToken(token: string | null | undefined) {
    const normalized = token?.trim();
    if (!normalized) {
      return null;
    }

    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  }
}
