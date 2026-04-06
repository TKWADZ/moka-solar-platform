import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { decryptSecret, encryptSecret, maskSecret } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateZaloSettingsDto } from './dto/update-zalo-settings.dto';

export type ZaloTemplateType = 'INVOICE' | 'REMINDER' | 'PAID';
export type ZaloConfigSource = 'database' | 'env' | 'default' | 'missing';
export type ZaloTokenState = 'MISSING' | 'AVAILABLE' | 'EXPIRED' | 'REJECTED';
export type ZaloAutoRefreshPersistMode = 'database' | 'env-only' | 'disabled';

type ZaloResolvedFieldKey =
  | 'appId'
  | 'appSecret'
  | 'oaId'
  | 'accessToken'
  | 'refreshToken'
  | 'apiBaseUrl'
  | 'oauthBaseUrl'
  | 'templateInvoiceId'
  | 'templateReminderId'
  | 'templatePaidId';

type ZaloResolvedField = {
  value: string | null;
  source: ZaloConfigSource;
  hasDbValue: boolean;
  hasEnvValue: boolean;
};

export type ResolvedZaloConfig = {
  appId: string | null;
  appSecret: string | null;
  oaId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl: string;
  oauthBaseUrl: string;
  dryRun: boolean;
  templateIds: Record<ZaloTemplateType, string | null>;
  missingRequired: string[];
  missingRecommended: string[];
  hasStoredAppSecret: boolean;
  hasStoredAccessToken: boolean;
  hasStoredRefreshToken: boolean;
  accessTokenPreview: string | null;
  refreshTokenPreview: string | null;
  appSecretPreview: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastRefreshAt: string | null;
  lastRefreshStatus: string | null;
  lastRefreshMessage: string | null;
  lastTokenCheckedAt: string | null;
  accessTokenState: ZaloTokenState;
  accessTokenExpiresAt: string | null;
  tokenSourcePolicy: 'DATABASE_THEN_ENV_FALLBACK';
  accessTokenSource: ZaloConfigSource;
  refreshTokenSource: ZaloConfigSource;
  appSecretSource: ZaloConfigSource;
  fieldSources: Record<ZaloResolvedFieldKey, ZaloConfigSource>;
  envFallbackInUse: ZaloResolvedFieldKey[];
  envShadowed: ZaloResolvedFieldKey[];
  autoRefreshEnabled: boolean;
  autoRefreshPersistMode: ZaloAutoRefreshPersistMode;
  autoRefreshWorking: boolean | null;
  recordExists: boolean;
};

const ZALO_PROVIDER = 'ZALO_OA';
const DEFAULT_ZALO_API_BASE_URL = 'https://openapi.zalo.me/v3.0/oa';
const DEFAULT_ZALO_OAUTH_BASE_URL = 'https://oauth.zaloapp.com/v4/oa';

@Injectable()
export class ZaloSettingsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private get providerConfigs() {
    return (this.prisma as PrismaClient).zaloProviderConfig;
  }

  async getSettings() {
    const resolved = await this.resolveConfig();

    return {
      provider: ZALO_PROVIDER,
      configuredForSend: resolved.missingRequired.length === 0,
      dryRun: resolved.dryRun,
      appId: resolved.appId,
      oaId: resolved.oaId,
      apiBaseUrl: resolved.apiBaseUrl,
      oauthBaseUrl: resolved.oauthBaseUrl,
      templateInvoiceId: resolved.templateIds.INVOICE,
      templateReminderId: resolved.templateIds.REMINDER,
      templatePaidId: resolved.templateIds.PAID,
      hasAppSecret: Boolean(resolved.appSecret),
      appSecretPreview: resolved.appSecretPreview,
      hasAccessToken: Boolean(resolved.accessToken),
      accessTokenPreview: resolved.accessTokenPreview,
      hasRefreshToken: Boolean(resolved.refreshToken),
      refreshTokenPreview: resolved.refreshTokenPreview,
      hasStoredAppSecret: resolved.hasStoredAppSecret,
      hasStoredAccessToken: resolved.hasStoredAccessToken,
      hasStoredRefreshToken: resolved.hasStoredRefreshToken,
      missingRequired: resolved.missingRequired,
      missingRecommended: resolved.missingRecommended,
      lastTestedAt: resolved.lastTestedAt,
      lastTestStatus: resolved.lastTestStatus,
      lastTestMessage: resolved.lastTestMessage,
      lastRefreshAt: resolved.lastRefreshAt,
      lastRefreshStatus: resolved.lastRefreshStatus,
      lastRefreshMessage: resolved.lastRefreshMessage,
      lastTokenCheckedAt: resolved.lastTokenCheckedAt,
      accessTokenState: resolved.accessTokenState,
      accessTokenExpiresAt: resolved.accessTokenExpiresAt,
      tokenSourcePolicy: resolved.tokenSourcePolicy,
      accessTokenSource: resolved.accessTokenSource,
      refreshTokenSource: resolved.refreshTokenSource,
      appSecretSource: resolved.appSecretSource,
      fieldSources: resolved.fieldSources,
      envFallbackInUse: resolved.envFallbackInUse,
      envShadowed: resolved.envShadowed,
      autoRefreshEnabled: resolved.autoRefreshEnabled,
      autoRefreshPersistMode: resolved.autoRefreshPersistMode,
      autoRefreshWorking: resolved.autoRefreshWorking,
      recordExists: resolved.recordExists,
      oaIdPreview: maskSecret(resolved.oaId, 2, 2),
      templateIds: {
        INVOICE: {
          configured: Boolean(resolved.templateIds.INVOICE),
          idPreview: maskSecret(resolved.templateIds.INVOICE, 2, 2),
          source: resolved.fieldSources.templateInvoiceId,
        },
        REMINDER: {
          configured: Boolean(resolved.templateIds.REMINDER),
          idPreview: maskSecret(resolved.templateIds.REMINDER, 2, 2),
          source: resolved.fieldSources.templateReminderId,
        },
        PAID: {
          configured: Boolean(resolved.templateIds.PAID),
          idPreview: maskSecret(resolved.templateIds.PAID, 2, 2),
          source: resolved.fieldSources.templatePaidId,
        },
      },
    };
  }

  async updateSettings(dto: UpdateZaloSettingsDto, actorId: string) {
    const current = await this.providerConfigs.findUnique({
      where: { provider: ZALO_PROVIDER },
    });

    const appId = this.normalizeOptional(dto.appId, current?.appId || null);
    const oaId = this.normalizeOptional(dto.oaId, current?.oaId || null);
    const apiBaseUrl = this.normalizeOptional(
      dto.apiBaseUrl,
      current?.apiBaseUrl || DEFAULT_ZALO_API_BASE_URL,
    );
    const templateInvoiceId = this.normalizeOptional(
      dto.templateInvoiceId,
      current?.templateInvoiceId || null,
    );
    const templateReminderId = this.normalizeOptional(
      dto.templateReminderId,
      current?.templateReminderId || null,
    );
    const templatePaidId = this.normalizeOptional(
      dto.templatePaidId,
      current?.templatePaidId || null,
    );

    const appSecretEncrypted = dto.appSecret?.trim()
      ? encryptSecret(dto.appSecret.trim(), this.getEncryptionSecret())
      : current?.appSecretEncrypted || null;
    const accessTokenEncrypted = dto.accessToken?.trim()
      ? encryptSecret(dto.accessToken.trim(), this.getEncryptionSecret())
      : current?.accessTokenEncrypted || null;
    const refreshTokenEncrypted = dto.refreshToken?.trim()
      ? encryptSecret(dto.refreshToken.trim(), this.getEncryptionSecret())
      : current?.refreshTokenEncrypted || null;

    if (
      !appId &&
      !oaId &&
      !apiBaseUrl &&
      !templateInvoiceId &&
      !templateReminderId &&
      !templatePaidId &&
      !appSecretEncrypted &&
      !accessTokenEncrypted &&
      !refreshTokenEncrypted
    ) {
      throw new BadRequestException('Vui long nhap it nhat mot truong cau hinh Zalo.');
    }

    const tokenUpdated = Boolean(dto.accessToken?.trim());
    const refreshTokenUpdated = Boolean(dto.refreshToken?.trim());

    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        appId,
        appSecretEncrypted,
        oaId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
        accessTokenExpiresAt: null,
        lastTokenCheckedAt: tokenUpdated ? new Date() : null,
        lastTokenStatus: tokenUpdated ? 'AVAILABLE' : null,
        lastTokenMessage: tokenUpdated
          ? 'Access token duoc cap nhat tu admin settings.'
          : null,
        updatedByUserId: actorId,
      },
      update: {
        appId,
        appSecretEncrypted,
        oaId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
        accessTokenExpiresAt: tokenUpdated ? null : current?.accessTokenExpiresAt || null,
        lastTokenCheckedAt: tokenUpdated || refreshTokenUpdated ? new Date() : undefined,
        lastTokenStatus: tokenUpdated ? 'AVAILABLE' : undefined,
        lastTokenMessage: tokenUpdated
          ? 'Access token duoc cap nhat tu admin settings.'
          : refreshTokenUpdated
            ? 'Refresh token duoc cap nhat tu admin settings.'
            : undefined,
        updatedByUserId: actorId,
        deletedAt: null,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'ZALO_SETTINGS_UPDATED',
      entityType: 'ZaloProviderConfig',
      entityId: ZALO_PROVIDER,
      payload: {
        provider: ZALO_PROVIDER,
        hasNewAppSecret: Boolean(dto.appSecret?.trim()),
        hasNewAccessToken: tokenUpdated,
        hasNewRefreshToken: refreshTokenUpdated,
        hasAppId: Boolean(appId),
        hasOaId: Boolean(oaId),
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
      },
    });

    return this.getSettings();
  }

  async resolveConfig(): Promise<ResolvedZaloConfig> {
    const record = await this.providerConfigs.findUnique({
      where: { provider: ZALO_PROVIDER },
    });

    const appSecretFromDb = record?.appSecretEncrypted
      ? decryptSecret(record.appSecretEncrypted, this.getEncryptionSecret())
      : null;
    const accessTokenFromDb = record?.accessTokenEncrypted
      ? decryptSecret(record.accessTokenEncrypted, this.getEncryptionSecret())
      : null;
    const refreshTokenFromDb = record?.refreshTokenEncrypted
      ? decryptSecret(record.refreshTokenEncrypted, this.getEncryptionSecret())
      : null;

    const appIdField = this.resolveField(record?.appId || null, 'ZALO_APP_ID');
    const appSecretField = this.resolveField(appSecretFromDb, 'ZALO_APP_SECRET');
    const oaIdField = this.resolveField(record?.oaId || null, 'ZALO_OA_ID');
    const accessTokenField = this.resolveField(accessTokenFromDb, 'ZALO_ACCESS_TOKEN');
    const refreshTokenField = this.resolveField(refreshTokenFromDb, 'ZALO_REFRESH_TOKEN');
    const apiBaseUrlField = this.resolveField(
      record?.apiBaseUrl || null,
      'ZALO_API_BASE_URL',
      DEFAULT_ZALO_API_BASE_URL,
    );
    const oauthBaseUrlField = this.resolveField(
      null,
      'ZALO_OAUTH_BASE_URL',
      DEFAULT_ZALO_OAUTH_BASE_URL,
    );
    const templateInvoiceField = this.resolveField(
      record?.templateInvoiceId || null,
      'ZALO_TEMPLATE_INVOICE_ID',
    );
    const templateReminderField = this.resolveField(
      record?.templateReminderId || null,
      'ZALO_TEMPLATE_REMINDER_ID',
    );
    const templatePaidField = this.resolveField(
      record?.templatePaidId || null,
      'ZALO_TEMPLATE_PAID_ID',
    );

    const fieldSources = {
      appId: appIdField.source,
      appSecret: appSecretField.source,
      oaId: oaIdField.source,
      accessToken: accessTokenField.source,
      refreshToken: refreshTokenField.source,
      apiBaseUrl: apiBaseUrlField.source,
      oauthBaseUrl: oauthBaseUrlField.source,
      templateInvoiceId: templateInvoiceField.source,
      templateReminderId: templateReminderField.source,
      templatePaidId: templatePaidField.source,
    } satisfies Record<ZaloResolvedFieldKey, ZaloConfigSource>;

    const envFallbackInUse = (Object.entries(fieldSources) as Array<
      [ZaloResolvedFieldKey, ZaloConfigSource]
    >)
      .filter(([, source]) => source === 'env')
      .map(([field]) => field);

    const envShadowed = (
      [
        ['appId', appIdField],
        ['appSecret', appSecretField],
        ['oaId', oaIdField],
        ['accessToken', accessTokenField],
        ['refreshToken', refreshTokenField],
        ['apiBaseUrl', apiBaseUrlField],
        ['oauthBaseUrl', oauthBaseUrlField],
        ['templateInvoiceId', templateInvoiceField],
        ['templateReminderId', templateReminderField],
        ['templatePaidId', templatePaidField],
      ] as Array<[ZaloResolvedFieldKey, ZaloResolvedField]>
    )
      .filter(([, field]) => field.hasDbValue && field.hasEnvValue)
      .map(([field]) => field);

    const canRefreshAccessToken = Boolean(
      refreshTokenField.value &&
        appIdField.value &&
        appSecretField.value &&
        oauthBaseUrlField.value,
    );
    const canSendWithAuth = Boolean(accessTokenField.value) || canRefreshAccessToken;

    const missingRequired = [
      !oaIdField.value ? 'ZALO_OA_ID' : null,
      !templateInvoiceField.value ? 'ZALO_TEMPLATE_INVOICE_ID' : null,
      !apiBaseUrlField.value ? 'ZALO_API_BASE_URL' : null,
      !canSendWithAuth ? 'ZALO_ACCESS_TOKEN_OR_REFRESH_TOKEN' : null,
      !accessTokenField.value && refreshTokenField.value && !appIdField.value ? 'ZALO_APP_ID' : null,
      !accessTokenField.value && refreshTokenField.value && !appSecretField.value
        ? 'ZALO_APP_SECRET'
        : null,
    ].filter((value): value is string => Boolean(value));

    const missingRecommended = [
      !refreshTokenField.value ? 'ZALO_REFRESH_TOKEN' : null,
      !appIdField.value ? 'ZALO_APP_ID' : null,
      !appSecretField.value ? 'ZALO_APP_SECRET' : null,
      !templateReminderField.value ? 'ZALO_TEMPLATE_REMINDER_ID' : null,
      !templatePaidField.value ? 'ZALO_TEMPLATE_PAID_ID' : null,
      !oauthBaseUrlField.value ? 'ZALO_OAUTH_BASE_URL' : null,
    ].filter((value): value is string => Boolean(value));

    const accessTokenExpiresAt = record?.accessTokenExpiresAt || null;
    const accessTokenState = this.resolveAccessTokenState({
      accessToken: accessTokenField.value,
      accessTokenExpiresAt,
      lastTokenStatus: record?.lastTokenStatus || null,
    });
    const autoRefreshPersistMode: ZaloAutoRefreshPersistMode = canRefreshAccessToken
      ? this.canPersistTokens(record)
        ? 'database'
        : 'env-only'
      : 'disabled';

    return {
      appId: appIdField.value,
      appSecret: appSecretField.value,
      oaId: oaIdField.value,
      accessToken: accessTokenField.value,
      refreshToken: refreshTokenField.value,
      apiBaseUrl: apiBaseUrlField.value || DEFAULT_ZALO_API_BASE_URL,
      oauthBaseUrl: oauthBaseUrlField.value || DEFAULT_ZALO_OAUTH_BASE_URL,
      dryRun: this.configService.get<string>('ZALO_DRY_RUN') !== 'false',
      templateIds: {
        INVOICE: templateInvoiceField.value,
        REMINDER: templateReminderField.value,
        PAID: templatePaidField.value,
      },
      missingRequired,
      missingRecommended,
      hasStoredAppSecret: Boolean(record?.appSecretEncrypted),
      hasStoredAccessToken: Boolean(record?.accessTokenEncrypted),
      hasStoredRefreshToken: Boolean(record?.refreshTokenEncrypted),
      accessTokenPreview: maskSecret(accessTokenField.value, 4, 3),
      refreshTokenPreview: maskSecret(refreshTokenField.value, 4, 3),
      appSecretPreview: maskSecret(appSecretField.value, 3, 3),
      lastTestedAt: record?.lastTestedAt?.toISOString() || null,
      lastTestStatus: record?.lastTestStatus || null,
      lastTestMessage: record?.lastTestMessage || null,
      lastRefreshAt: record?.lastRefreshAt?.toISOString() || null,
      lastRefreshStatus: record?.lastRefreshStatus || null,
      lastRefreshMessage: record?.lastRefreshMessage || null,
      lastTokenCheckedAt: record?.lastTokenCheckedAt?.toISOString() || null,
      accessTokenState,
      accessTokenExpiresAt: accessTokenExpiresAt?.toISOString() || null,
      tokenSourcePolicy: 'DATABASE_THEN_ENV_FALLBACK',
      accessTokenSource: accessTokenField.source,
      refreshTokenSource: refreshTokenField.source,
      appSecretSource: appSecretField.source,
      fieldSources,
      envFallbackInUse,
      envShadowed,
      autoRefreshEnabled: canRefreshAccessToken,
      autoRefreshPersistMode,
      autoRefreshWorking:
        record?.lastRefreshStatus === 'SUCCESS'
          ? true
          : record?.lastRefreshStatus === 'FAILED'
            ? false
            : null,
      recordExists: Boolean(record),
    };
  }

  async recordTestResult(params: {
    actorId?: string;
    status: string;
    message: string;
  }) {
    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        lastTestedAt: new Date(),
        lastTestStatus: params.status,
        lastTestMessage: params.message,
        updatedByUserId: params.actorId || null,
      },
      update: {
        lastTestedAt: new Date(),
        lastTestStatus: params.status,
        lastTestMessage: params.message,
        updatedByUserId: params.actorId || undefined,
        deletedAt: null,
      },
    });
  }

  async recordTokenStatus(params: {
    actorId?: string;
    status: ZaloTokenState;
    message: string;
    accessTokenExpiresAt?: Date | null;
  }) {
    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        lastTokenCheckedAt: new Date(),
        lastTokenStatus: params.status,
        lastTokenMessage: params.message,
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? null,
        updatedByUserId: params.actorId || null,
      },
      update: {
        lastTokenCheckedAt: new Date(),
        lastTokenStatus: params.status,
        lastTokenMessage: params.message,
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? undefined,
        updatedByUserId: params.actorId || undefined,
        deletedAt: null,
      },
    });
  }

  async recordRefreshResult(params: {
    actorId?: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    message: string;
    accessTokenExpiresAt?: Date | null;
    nextTokenState?: ZaloTokenState;
  }) {
    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        lastRefreshAt: new Date(),
        lastRefreshStatus: params.status,
        lastRefreshMessage: params.message,
        lastTokenCheckedAt: params.nextTokenState ? new Date() : null,
        lastTokenStatus: params.nextTokenState || null,
        lastTokenMessage: params.nextTokenState ? params.message : null,
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? null,
        updatedByUserId: params.actorId || null,
      },
      update: {
        lastRefreshAt: new Date(),
        lastRefreshStatus: params.status,
        lastRefreshMessage: params.message,
        lastTokenCheckedAt: params.nextTokenState ? new Date() : undefined,
        lastTokenStatus: params.nextTokenState || undefined,
        lastTokenMessage: params.nextTokenState ? params.message : undefined,
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? undefined,
        updatedByUserId: params.actorId || undefined,
        deletedAt: null,
      },
    });
  }

  async persistRefreshedTokens(params: {
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    actorId?: string;
  }) {
    const current = await this.providerConfigs.findUnique({
      where: { provider: ZALO_PROVIDER },
    });

    if (!this.canPersistTokens(current)) {
      await this.recordRefreshResult({
        actorId: params.actorId,
        status: 'SUCCESS',
        message:
          'Access token da duoc refresh, nhung he thong dang dung nguon env nen khong ghi de vao DB.',
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? null,
        nextTokenState: 'AVAILABLE',
      });

      return {
        persisted: false,
        persistMode: 'env-only' as const,
      };
    }

    await this.providerConfigs.update({
      where: { provider: ZALO_PROVIDER },
      data: {
        accessTokenEncrypted: encryptSecret(params.accessToken, this.getEncryptionSecret()),
        refreshTokenEncrypted: params.refreshToken?.trim()
          ? encryptSecret(params.refreshToken.trim(), this.getEncryptionSecret())
          : undefined,
        accessTokenExpiresAt: params.accessTokenExpiresAt ?? null,
        lastRefreshAt: new Date(),
        lastRefreshStatus: 'SUCCESS',
        lastRefreshMessage: 'Da refresh access token tu refresh token.',
        lastTokenCheckedAt: new Date(),
        lastTokenStatus: 'AVAILABLE',
        lastTokenMessage: 'Access token da duoc refresh thanh cong.',
        updatedByUserId: params.actorId || undefined,
        deletedAt: null,
      },
    });

    return {
      persisted: true,
      persistMode: 'database' as const,
    };
  }

  private normalizeOptional(value: string | undefined, currentValue: string | null) {
    if (value === undefined) {
      return currentValue;
    }

    const trimmed = value.trim();
    return trimmed || null;
  }

  private resolveField(
    dbValue: string | null,
    envName: string,
    defaultValue?: string,
  ): ZaloResolvedField {
    const normalizedDbValue = dbValue?.trim() || null;
    const envValue = this.readEnv(envName);

    if (normalizedDbValue) {
      return {
        value: normalizedDbValue,
        source: 'database',
        hasDbValue: true,
        hasEnvValue: Boolean(envValue),
      };
    }

    if (envValue) {
      return {
        value: envValue,
        source: 'env',
        hasDbValue: false,
        hasEnvValue: true,
      };
    }

    if (defaultValue) {
      return {
        value: defaultValue,
        source: 'default',
        hasDbValue: false,
        hasEnvValue: false,
      };
    }

    return {
      value: null,
      source: 'missing',
      hasDbValue: false,
      hasEnvValue: false,
    };
  }

  private resolveAccessTokenState(params: {
    accessToken: string | null;
    accessTokenExpiresAt: Date | null;
    lastTokenStatus: string | null;
  }): ZaloTokenState {
    if (!params.accessToken) {
      return 'MISSING';
    }

    if (
      params.accessTokenExpiresAt &&
      params.accessTokenExpiresAt.getTime() <= Date.now()
    ) {
      return 'EXPIRED';
    }

    if (params.lastTokenStatus === 'REJECTED') {
      return 'REJECTED';
    }

    return 'AVAILABLE';
  }

  private readEnv(name: string) {
    const value = this.configService.get<string>(name)?.trim();
    return value || null;
  }

  private getEncryptionSecret() {
    return (
      this.configService.get<string>('ZALO_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-zalo-settings'
    );
  }

  private canPersistTokens(
    record:
      | {
          appId?: string | null;
          appSecretEncrypted?: string | null;
          oaId?: string | null;
          accessTokenEncrypted?: string | null;
          refreshTokenEncrypted?: string | null;
          apiBaseUrl?: string | null;
          templateInvoiceId?: string | null;
          templateReminderId?: string | null;
          templatePaidId?: string | null;
        }
      | null
      | undefined,
  ) {
    return Boolean(
      record &&
        (
          record.appId ||
          record.appSecretEncrypted ||
          record.oaId ||
          record.accessTokenEncrypted ||
          record.refreshTokenEncrypted ||
          record.apiBaseUrl ||
          record.templateInvoiceId ||
          record.templateReminderId ||
          record.templatePaidId
        ),
    );
  }
}
