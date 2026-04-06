import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
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
    const hotline = await this.resolveHotline();
    const recipientPhone = this.normalizePhoneNumber(dto.phone || '');
    const templateId = config.templateIds.INVOICE;
    const requestPayload = {
      oa_id: config.oaId,
      phone: recipientPhone,
      template_id: templateId,
      template_data: {
        customer_name: 'Khach hang test',
        billing_month: new Date().toISOString().slice(0, 7).replace('-', '/'),
        consumption_kwh: '0',
        amount_due: '0',
        due_date: '',
        payment_link: this.buildPaymentLink('test-zalo'),
        hotline,
      },
      tracking_id: `TEST-${Date.now()}`,
      mode: 'test_connection',
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
    const paymentLink = this.buildPaymentLink(invoice.id);
    const templateId = config.templateIds[templateType];
    const billableConsumption =
      Number(invoice.monthlyPvBilling?.billableKwh || 0) ||
      Number(invoice.monthlyPvBilling?.pvGenerationKwh || 0);
    const payloadVariables = {
      customer_name:
        invoice.customer?.companyName?.trim() ||
        invoice.customer?.user?.fullName?.trim() ||
        'Quy khach',
      billing_month: `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`,
      consumption_kwh: this.formatDecimalForPayload(billableConsumption),
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
    purpose: 'TEST' | 'INVOICE' | 'DIAGNOSTICS';
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
        recipientPhone: params.recipientPhone,
        dryRun: true,
        requestPayload: params.requestPayload,
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
          debug: this.buildTokenDebug({
            resolution: tokenResolution,
            templateType: params.templateType,
          }),
        },
        missingRequired: params.config.missingRequired,
        missingRecommended: params.config.missingRecommended,
        debug: this.buildTokenDebug({
          resolution: tokenResolution,
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
        recipientPhone: params.recipientPhone,
        dryRun: false,
        requestPayload: params.requestPayload,
        sendStatus: 'FAILED',
        providerCode: tokenResolution.providerCode || 'MISSING_ACCESS_TOKEN',
        providerMessage:
          tokenResolution.providerMessage ||
          'Khong co access token hop le de gui thong bao Zalo.',
        missingRequired: tokenResolution.config.missingRequired,
        missingRecommended: tokenResolution.config.missingRecommended,
        responsePayload: tokenResolution.responsePayload,
        debug: this.buildTokenDebug({
          resolution: tokenResolution,
          templateType: params.templateType,
        }),
      });
    }

    const primaryAttempt = await this.performProviderSend({
      accessToken: tokenResolution.accessToken,
      config: tokenResolution.config,
      requestPayload: params.requestPayload,
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
        recipientPhone: params.recipientPhone,
        dryRun: false,
        requestPayload: params.requestPayload,
        responsePayload: primaryAttempt.responsePayload,
        sendStatus: primaryAttempt.sendStatus,
        providerCode: primaryAttempt.providerCode,
        providerMessage: primaryAttempt.providerMessage,
        missingRequired: tokenResolution.config.missingRequired,
        missingRecommended: tokenResolution.config.missingRecommended,
        debug: this.buildTokenDebug({
          resolution: {
            ...tokenResolution,
            sendTokenFingerprint: primaryAttempt.tokenFingerprint,
            tokenSource: primaryAttempt.tokenSource,
            configRecordId: primaryAttempt.configRecordId,
          },
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
      recipientPhone: params.recipientPhone,
      requestPayload: params.requestPayload,
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
          recipientPhone: params.recipientPhone,
          dryRun: false,
          requestPayload: params.requestPayload,
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
          debug: this.buildTokenDebug({
            resolution: tokenResolution,
            templateType: params.templateType,
          }),
        });
      }

      const retryAttempt = await this.performProviderSend({
        accessToken: tokenResolution.accessToken,
        config: tokenResolution.config,
        requestPayload: params.requestPayload,
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
        recipientPhone: params.recipientPhone,
        dryRun: false,
        requestPayload: params.requestPayload,
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
        debug: this.buildTokenDebug({
          resolution: {
            ...tokenResolution,
            sendTokenFingerprint: retryAttempt.tokenFingerprint,
            tokenSource: retryAttempt.tokenSource,
            configRecordId: retryAttempt.configRecordId,
          },
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
      recipientPhone: params.recipientPhone,
      dryRun: false,
      requestPayload: params.requestPayload,
      responsePayload: params.primaryAttempt.responsePayload,
      sendStatus: params.primaryAttempt.sendStatus,
      providerCode: params.primaryAttempt.providerCode,
      providerMessage: params.primaryAttempt.providerMessage,
      missingRequired: params.config.missingRequired,
      missingRecommended: params.config.missingRecommended,
      debug: {
        token_source: params.primaryAttempt.tokenSource,
        config_record_id: params.primaryAttempt.configRecordId,
        send_token_fingerprint: params.primaryAttempt.tokenFingerprint,
        stale_token_detected: false,
      },
    });
  }

  private async performProviderSend(params: {
    accessToken: string;
    config: ResolvedZaloConfig;
    requestPayload: Record<string, unknown>;
    tokenSource: string;
    configRecordId: string | null;
  }): Promise<ProviderAttemptResult> {
    const sendUrl = this.buildSendUrl(params.config.apiBaseUrl);
    let response: Response;
    let responseBody: unknown = null;

    try {
      response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.accessToken}`,
          'X-Zalo-OA-ID': params.config.oaId || '',
        },
        body: JSON.stringify(params.requestPayload),
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
          responsePayloadWithDebug !== undefined
            ? ((responsePayloadWithDebug as Prisma.InputJsonValue) ?? Prisma.JsonNull)
            : Prisma.JsonNull,
      },
    });

    await this.auditLogsService.log({
      userId: params.actorId,
      action:
        params.templateType === 'TEST'
          ? 'ZALO_TEST_CONNECTION_SENT'
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
      logId: log.id,
      sentAt: log.createdAt.toISOString(),
      debug: params.debug || null,
    };
  }

  private buildSendUrl(apiBaseUrl: string) {
    const trimmed = apiBaseUrl.replace(/\/$/, '');
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
